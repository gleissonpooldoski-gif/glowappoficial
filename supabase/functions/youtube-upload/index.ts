// Upload de vídeo para o YouTube via Data API v3 usando upload RESUMABLE.
// Streaming direto do Storage → YouTube, sem carregar o vídeo inteiro em memória
// (evita HTTP 546 / resource limit no Edge Runtime).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const RESUMABLE_INIT_ENDPOINT =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

async function ensureAccessToken(
  supabase: any,
  account: string,
): Promise<{ access_token: string; cred: any }> {
  const { data: cred, error } = await supabase
    .from("youtube_credentials")
    .select("*")
    .eq("account", account)
    .maybeSingle();
  if (error) throw error;
  if (!cred) throw new Error("Conta do YouTube não conectada.");

  const expiresAt = cred.expires_at ? new Date(cred.expires_at).getTime() : 0;
  const needsRefresh = !cred.access_token || !expiresAt || expiresAt - Date.now() < 60_000;
  if (!needsRefresh) return { access_token: cred.access_token, cred };

  if (!cred.refresh_token) throw new Error("refresh_token ausente. Reconecte a conta.");
  const clientId = (Deno.env.get("YOUTUBE_CLIENT_ID") ?? "").trim();
  const clientSecret = (Deno.env.get("YOUTUBE_CLIENT_SECRET") ?? "").trim();
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: cred.refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error_description ?? json.error ?? "Falha ao renovar token.");
  const newExpires = json.expires_in
    ? new Date(Date.now() + Number(json.expires_in) * 1000).toISOString()
    : null;
  await supabase.from("youtube_credentials").update({
    access_token: json.access_token,
    expires_at: newExpires,
    scope: json.scope ?? cred.scope,
    last_validated_at: new Date().toISOString(),
    last_validation_status: "VALID",
    last_validation_detail: "Token renovado antes do upload.",
  }).eq("account", account);
  return { access_token: json.access_token, cred: { ...cred, access_token: json.access_token } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const account = (body.account ?? "default").toString();
    const title = String(body.title ?? "").trim();
    if (!title) throw new Error("Título é obrigatório.");
    const description = String(body.description ?? "");
    const tags: string[] = Array.isArray(body.tags)
      ? body.tags.map((t: any) => String(t)).filter(Boolean)
      : String(body.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    const categoryId = String(body.category_id ?? "22"); // 22 = People & Blogs
    const privacyStatus = ["private", "unlisted", "public"].includes(body.privacy_status)
      ? body.privacy_status
      : "private";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Localiza o arquivo no Storage.
    let bucket: string | null = body.storage_bucket ?? null;
    let path: string | null = body.storage_path ?? null;
    let mime = "video/mp4";
    if (body.video_id) {
      const { data: video, error: vErr } = await supabase
        .from("videos")
        .select("original_path, processed_path, mime_type")
        .eq("id", body.video_id)
        .maybeSingle();
      if (vErr) throw vErr;
      if (!video) throw new Error("Vídeo não encontrado.");
      if (video.processed_path) {
        bucket = bucket ?? "videos-processed";
        path = video.processed_path;
      } else if (video.original_path) {
        bucket = bucket ?? "videos";
        path = video.original_path;
      } else {
        throw new Error("Este item não possui arquivo de vídeo. Renderize/finalize o vídeo antes de publicar no YouTube.");
      }
      mime = video.mime_type || mime;
    }
    if (!bucket || !path) throw new Error("Arquivo do vídeo não informado.");

    // Baixa do Storage como Blob (mantém streamable — não força arrayBuffer).
    const { data: blobData, error: dlErr } = await supabase.storage.from(bucket).download(path);
    if (dlErr || !blobData) throw new Error(dlErr?.message ?? "Falha ao baixar vídeo do storage.");
    const totalSize = blobData.size;
    if (!totalSize) throw new Error("Arquivo do vídeo está vazio no storage.");

    const { access_token } = await ensureAccessToken(supabase, account);

    // === 1) Inicia sessão resumable com metadados ===
    const metadata = {
      snippet: { title, description, tags, categoryId },
      status: { privacyStatus, selfDeclaredMadeForKids: false },
    };
    const initRes = await fetch(RESUMABLE_INIT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mime,
        "X-Upload-Content-Length": String(totalSize),
      },
      body: JSON.stringify(metadata),
    });
    if (!initRes.ok) {
      const text = await initRes.text().catch(() => "");
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* noop */ }
      const msg = parsed?.error?.message ?? text ?? `Falha ao iniciar upload (${initRes.status}).`;
      await supabase.from("youtube_credentials").update({
        last_validated_at: new Date().toISOString(),
        last_validation_status: "UPLOAD_INIT_FAILED",
        last_validation_detail: msg.slice(0, 400),
      }).eq("account", account);
      throw new Error(`Init upload falhou: ${msg}`);
    }
    const uploadUrl = initRes.headers.get("location") ?? initRes.headers.get("Location");
    if (!uploadUrl) throw new Error("YouTube não retornou URL de upload resumable.");

    // === 2) Envia bytes via stream (sem carregar em memória) ===
    // Retry automático em 5xx (503, 502, 500) — YouTube recomenda backoff exponencial.
    let uploadRes: Response | null = null;
    let uploadText = "";
    let uploadJson: any = null;
    const MAX_TRIES = 3;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      try {
        uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": mime, "Content-Length": String(totalSize) },
          body: blobData, // Blob nativo — fetch envia streamado.
        });
        uploadText = await uploadRes.text().catch(() => "");
        try { uploadJson = uploadText ? JSON.parse(uploadText) : null; } catch { /* noop */ }
        // 5xx → backoff e tenta de novo até MAX_TRIES.
        if (uploadRes.status >= 500 && uploadRes.status < 600 && attempt < MAX_TRIES) {
          await new Promise((r) => setTimeout(r, attempt * 2000));
          continue;
        }
        break;
      } catch (err: any) {
        if (attempt >= MAX_TRIES) throw err;
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
    if (!uploadRes || !uploadRes.ok) {
      const status = uploadRes?.status ?? 500;
      let msg = uploadJson?.error?.message ?? uploadText ?? `Falha no upload (${status}).`;
      // Mensagens específicas para casos comuns.
      if (status === 503) msg = "YouTube temporariamente indisponível após 3 tentativas. Reenfileire em alguns minutos.";
      if (status === 413 || /too large/i.test(msg)) {
        msg = "Vídeo muito grande para upload em uma única requisição. Reduza a duração/tamanho ou re-renderize com bitrate menor.";
      }
      await supabase.from("youtube_credentials").update({
        last_validated_at: new Date().toISOString(),
        last_validation_status: "UPLOAD_FAILED",
        last_validation_detail: String(msg).slice(0, 400),
      }).eq("account", account);
      return new Response(JSON.stringify({ error: msg, status }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        video_id: uploadJson?.id ?? null,
        url: uploadJson?.id ? `https://youtu.be/${uploadJson.id}` : null,
        snippet: uploadJson?.snippet,
        status: uploadJson?.status,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[youtube-upload]", e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro no upload." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
