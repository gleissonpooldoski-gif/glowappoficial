// Publica um comentário monetizado (afiliado) num vídeo do YouTube.
// Body: { youtube_post_id: string } OU { video_id: string, youtube_video_id: string, account: string }
// Fluxo:
//   1. Localiza o project_id via videos.project_id
//   2. Carrega project_affiliate_configs + project_comment_templates do projeto (nunca mistura)
//   3. Escolhe o próximo modelo (rotação por last_used_at)
//   4. Adapta com IA (Lovable AI Gateway) mantendo produto/link fixos
//   5. Envia via commentThreads.insert (requer scope youtube.force-ssl)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const COMMENT_ENDPOINT =
  "https://www.googleapis.com/youtube/v3/commentThreads?part=snippet";

async function ensureAccessToken(supabase: any, account: string) {
  const { data: cred, error } = await supabase
    .from("youtube_credentials").select("*").eq("account", account).maybeSingle();
  if (error) throw error;
  if (!cred) throw new Error("Conta do YouTube não conectada.");
  const exp = cred.expires_at ? new Date(cred.expires_at).getTime() : 0;
  if (cred.access_token && exp - Date.now() > 60_000) return cred.access_token;
  if (!cred.refresh_token) throw new Error("refresh_token ausente.");
  const form = new URLSearchParams({
    client_id: (Deno.env.get("YOUTUBE_CLIENT_ID") ?? "").trim(),
    client_secret: (Deno.env.get("YOUTUBE_CLIENT_SECRET") ?? "").trim(),
    refresh_token: cred.refresh_token,
    grant_type: "refresh_token",
  });
  const r = await fetch(TOKEN_ENDPOINT, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description ?? j.error ?? "Falha ao renovar token.");
  await supabase.from("youtube_credentials").update({
    access_token: j.access_token,
    expires_at: j.expires_in ? new Date(Date.now() + Number(j.expires_in) * 1000).toISOString() : null,
    scope: j.scope ?? cred.scope,
  }).eq("account", account);
  return j.access_token;
}

// Remove qualquer URL/link/menção que a IA possa inserir — comentários devem apontar SOMENTE para a BIO.
function stripLinks(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/\b[\w-]+\.(com|br|net|org|io|site|link|xyz|app|co|me)(\/\S*)?/gi, "")
    .replace(/\[link\]/gi, "")
    .replace(/@\S+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function adaptWithAI(base: string, ctx: { title?: string; description?: string; product: string }) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return base;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content:
            `Você adapta comentários curtos de CTA para YouTube. Regras absolutas:\n` +
            `- Contexto do produto: "${ctx.product}" (mas NÃO cite o nome no comentário — o CTA aponta para a BIO).\n` +
            `- PROIBIDO incluir links, URLs, domínios, "http", "www", códigos de afiliado, @menções ou hashtags.\n` +
            `- Sempre direcionar o público para a BIO do canal (use "na BIO 👆" ou equivalente natural).\n` +
            `- Mantenha o tom, a estrutura, os emojis e o número de linhas do modelo.\n` +
            `- Ajuste levemente a primeira frase para conversar com o tema do vídeo.\n` +
            `- Máximo 280 caracteres.\n` +
            `- Retorne APENAS o texto final do comentário.` },
          { role: "user", content:
            `Título do vídeo: ${ctx.title ?? "(sem título)"}\n` +
            `Descrição (trecho): ${(ctx.description ?? "").slice(0, 400)}\n\n` +
            `Modelo base:\n${base}` },
        ],
        temperature: 0.7,
      }),
    });
    if (!res.ok) return base;
    const j: any = await res.json();
    const out = stripLinks(String(j?.choices?.[0]?.message?.content ?? "").trim());
    if (!out || out.length < 12) return base;
    return out;
  } catch { return base; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json();
    let post: any = null;
    if (body.youtube_post_id) {
      const { data } = await supabase.from("youtube_posts").select("*").eq("id", body.youtube_post_id).maybeSingle();
      post = data;
    } else {
      post = { video_id: body.video_id, youtube_video_id: body.youtube_video_id, account: body.account,
        title: body.title, description: body.description };
    }
    if (!post?.youtube_video_id) throw new Error("youtube_video_id ausente.");
    if (!post?.account) throw new Error("account (canal) ausente.");
    if (!post?.video_id) throw new Error("video_id ausente.");

    // Descobre project_id
    const { data: video } = await supabase.from("videos").select("project_id").eq("id", post.video_id).maybeSingle();
    if (!video?.project_id) throw new Error("Projeto do vídeo não encontrado.");

    // Config do afiliado (isolada por projeto — nunca mistura)
    const { data: cfg } = await supabase.from("project_affiliate_configs")
      .select("*").eq("project_id", video.project_id).eq("is_active", true).maybeSingle();
    if (!cfg) return new Response(JSON.stringify({ skipped: "sem configuração de afiliado para este projeto" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Modelos ativos, rotação por last_used_at
    const { data: templates } = await supabase.from("project_comment_templates")
      .select("*").eq("project_id", video.project_id).eq("is_active", true)
      .order("last_used_at", { ascending: true, nullsFirst: true }).order("position", { ascending: true });
    if (!templates?.length) return new Response(JSON.stringify({ skipped: "sem modelos de comentário" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const tpl = templates[0];
    const adapted = await adaptWithAI(tpl.template, { title: post.title, description: post.description, product: cfg.product_name });
    const finalText = adapted.replaceAll("[link]", cfg.affiliate_link);

    const accessToken = await ensureAccessToken(supabase, post.account);
    const payload = {
      snippet: {
        videoId: post.youtube_video_id,
        topLevelComment: { snippet: { textOriginal: finalText } },
      },
    };
    const r = await fetch(COMMENT_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j?.error?.message ?? `HTTP ${r.status}`;
      if (post.id) {
        await supabase.from("youtube_posts").update({
          comment_status: "ERRO", comment_error: msg, comment_text: finalText,
        }).eq("id", post.id);
      }
      return new Response(JSON.stringify({ error: msg, details: j }), {
        status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const commentId = j?.id ?? j?.snippet?.topLevelComment?.id ?? null;
    await supabase.from("project_comment_templates").update({ last_used_at: new Date().toISOString() }).eq("id", tpl.id);
    if (post.id) {
      await supabase.from("youtube_posts").update({
        comment_status: "PUBLICADO", comment_id: commentId,
        comment_text: finalText, comment_posted_at: new Date().toISOString(), comment_error: null,
      }).eq("id", post.id);
    }
    // Observação: API do YouTube não permite fixar comentários programaticamente.
    return new Response(JSON.stringify({ success: true, comment_id: commentId, text: finalText, note: "Fixar precisa ser feito manualmente pelo YouTube Studio (não há endpoint público)." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[youtube-post-comment]", e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
