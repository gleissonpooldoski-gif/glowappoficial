// Publica um vídeo no TikTok usando a Content Posting API (modo PULL_FROM_URL).
// Body: { videoId, account, caption, scheduledAt?, privacy_level? }
// - Se scheduledAt for futuro, cria registro em tiktok_posts com status AGENDADO;
//   o scheduler (a implementar via pg_cron) reinvoca sem scheduledAt para publicar.
// - Sem scheduledAt (ou passado), chama /post/publish/video/init/ imediatamente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const PUBLISH_INIT_ENDPOINT = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const TOKEN_ENDPOINT = "https://open.tiktokapis.com/v2/oauth/token/";
type Account = "resenha" | "frame";

async function refreshIfNeeded(supabase: any, row: any) {
  const exp = row?.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (exp && exp - Date.now() > 120_000) return row;
  const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
  const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");
  if (!clientKey || !clientSecret) throw new Error("TIKTOK_CLIENT_KEY/SECRET ausentes.");
  if (!row?.refresh_token) throw new Error(`Conta ${row?.account}: refresh_token ausente — reconecte.`);

  const form = new URLSearchParams({
    client_key: clientKey, client_secret: clientSecret,
    grant_type: "refresh_token", refresh_token: row.refresh_token,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: form.toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json as any).error) {
    const msg = (json as any).error_description ?? (json as any).error ?? "refresh falhou";
    throw new Error(`Renovação do token falhou: ${msg}`);
  }
  const expiresIn = Number((json as any).expires_in ?? 0);
  const refreshExpiresIn = Number((json as any).refresh_expires_in ?? 0);
  const patch = {
    access_token: (json as any).access_token,
    refresh_token: (json as any).refresh_token ?? row.refresh_token,
    expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    refresh_expires_at: refreshExpiresIn ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString() : null,
    scope: (json as any).scope ?? row.scope,
    last_validated_at: new Date().toISOString(),
    last_validation_status: "VALID",
    last_validation_detail: "Token renovado no publish.",
  };
  await supabase.from("tiktok_credentials").update(patch).eq("account", row.account);
  return { ...row, ...patch };
}

async function resolveVideoUrl(supabase: any, videoId: string): Promise<string> {
  const { data: video, error } = await supabase.from("videos").select("storage_path,file_url").eq("id", videoId).maybeSingle();
  if (error) throw error;
  if (!video) throw new Error("Vídeo não encontrado.");
  // Preferência: signed URL do bucket 'videos-processed' ou 'videos'
  const path: string | null = video.storage_path ?? null;
  if (path) {
    const buckets = ["videos-processed", "videos", "videos-original", "media"];
    for (const bucket of buckets) {
      const { data, error: e2 } = await supabase.storage.from(bucket).createSignedUrl(path.replace(new RegExp(`^${bucket}/`), ""), 60 * 60);
      if (!e2 && data?.signedUrl) return data.signedUrl;
    }
  }
  if (video.file_url) return video.file_url as string;
  throw new Error("Não foi possível gerar uma URL pública/assinada para o vídeo.");
}

function friendlyTikTokError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("scope_not_authorized") || m.includes("scope not authorized"))
    return "Escopo não autorizado (video.publish/video.upload). Reconecte o TikTok concedendo as permissões.";
  if (m.includes("access_token_invalid") || m.includes("token")) return "Token do TikTok inválido ou expirado — reconecte a conta.";
  if (m.includes("url_ownership_unverified")) return "URL do vídeo não verificada pelo TikTok. O domínio precisa estar na lista de URL Properties do app.";
  if (m.includes("spam_risk") || m.includes("rate_limit")) return "Limite de publicações atingido no TikTok. Tente novamente mais tarde.";
  if (m.includes("video_pull_failed")) return "TikTok não conseguiu baixar o vídeo pela URL enviada.";
  return msg;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    let { postId, videoId, account, caption, scheduledAt, privacy_level } = body as {
      postId?: string; videoId?: string; account?: Account; caption?: string;
      scheduledAt?: string | null; privacy_level?: string;
    };

    // Modo scheduler: reprocessa um post pelo postId
    let postRow: any = null;
    if (postId) {
      const { data, error } = await supabase.from("tiktok_posts").select("*").eq("id", postId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Post do TikTok não encontrado.");
      postRow = data;
      videoId = data.video_id; account = data.account; caption = data.caption; scheduledAt = null;
    }

    if (!videoId || !account) throw new Error("videoId e account são obrigatórios.");
    if (!["resenha", "frame"].includes(account)) throw new Error("Conta inválida.");
    const cap = (caption ?? "").toString().slice(0, 2200);

    // Cria/agenda o registro
    if (!postRow) {
      const isFuture = scheduledAt && new Date(scheduledAt).getTime() > Date.now() + 30_000;
      const { data: inserted, error: insErr } = await supabase.from("tiktok_posts").insert({
        video_id: videoId, account, caption: cap,
        status: isFuture ? "AGENDADO" : "PUBLICANDO",
        scheduled_at: scheduledAt ?? null,
      }).select("*").maybeSingle();
      if (insErr) throw insErr;
      postRow = inserted;
      if (isFuture) {
        return new Response(JSON.stringify({ success: true, scheduled: true, post: postRow }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      await supabase.from("tiktok_posts").update({ status: "PUBLICANDO", error_message: null }).eq("id", postRow.id);
    }

    // Credenciais + refresh oportunista
    const { data: cred, error: credErr } = await supabase.from("tiktok_credentials").select("*").eq("account", account).maybeSingle();
    if (credErr) throw credErr;
    if (!cred?.access_token) throw new Error(`Conta ${account} não conectada ao TikTok.`);
    const fresh = await refreshIfNeeded(supabase, cred);

    // URL do vídeo (PULL_FROM_URL)
    const videoUrl = await resolveVideoUrl(supabase, videoId);

    // Chamada de publicação
    const payload = {
      post_info: {
        title: cap,
        privacy_level: privacy_level ?? "SELF_ONLY", // apps não auditados só publicam privado
        disable_duet: false, disable_comment: false, disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
    };

    const res = await fetch(PUBLISH_INIT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fresh.access_token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    const errObj = json?.error;
    const providerOk = res.ok && errObj && errObj.code === "ok";
    if (!providerOk) {
      const raw = errObj?.message || errObj?.code || text || `HTTP ${res.status}`;
      const friendly = friendlyTikTokError(String(raw));
      await supabase.from("tiktok_posts").update({
        status: "ERRO",
        error_message: friendly,
        logs: [{ at: new Date().toISOString(), step: "publish/init", ok: false, status: res.status, response: json }],
        video_url: videoUrl,
      }).eq("id", postRow.id);
      return new Response(JSON.stringify({ success: false, error: friendly, details: json }),
        { status: res.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const publishId = json?.data?.publish_id ?? null;
    await supabase.from("tiktok_posts").update({
      status: "PUBLICADO",
      publish_id: publishId,
      video_url: videoUrl,
      published_at: new Date().toISOString(),
      logs: [{ at: new Date().toISOString(), step: "publish/init", ok: true, response: json }],
    }).eq("id", postRow.id);

    return new Response(JSON.stringify({ success: true, publish_id: publishId, post: { ...postRow, publish_id: publishId } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[tiktok-publish]", e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro ao publicar no TikTok." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
