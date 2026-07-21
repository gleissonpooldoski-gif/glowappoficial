// Publica um comentário automático em um Reel/post do Instagram, com CTA
// direcionando para a BIO (nunca inclui link).
//
// Body:
//   { instagram_post_id: string }
//   OU { publish_id: string, video_id: string, account: string, title?: string, description?: string }
//
// Fluxo:
//   1. Localiza o project_id via videos.project_id
//   2. Carrega project_affiliate_configs + project_comment_templates do projeto (nunca mistura)
//   3. Escolhe o próximo modelo (rotação por last_used_at)
//   4. Adapta com IA (Lovable AI Gateway) mantendo tom e CTA para BIO
//   5. Sanitiza (remove URLs, domínios, @menções e placeholders)
//   6. Envia via POST /{ig-media-id}/comments (Graph API v25.0)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH_BASE = "https://graph.facebook.com/v25.0";
const IG_BASE = "https://graph.instagram.com/v25.0";

function sanitizeToken(t: string): string {
  return (t ?? "").toString().replace(/\s+/g, "").trim();
}

// Roteia entre graph.facebook.com e graph.instagram.com pelo prefixo do token.
function baseForToken(token: string): string {
  return token.startsWith("IGAA") || token.startsWith("IGQ") ? IG_BASE : GRAPH_BASE;
}

// Remove qualquer URL/link/menção — comentários devem apontar SOMENTE para a BIO.
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

async function envTokenFor(account: string) {
  if (account === "resenha") {
    return {
      token: sanitizeToken(Deno.env.get("META_RESENHA_ACCESS_TOKEN") ?? ""),
      igId: (Deno.env.get("META_RESENHA_INSTAGRAM_ID") ?? "").trim(),
    };
  }
  if (account === "frame") {
    return {
      token: sanitizeToken(Deno.env.get("META_FRAME_ACCESS_TOKEN") ?? ""),
      igId: (Deno.env.get("META_FRAME_INSTAGRAM_ID") ?? "").trim(),
    };
  }
  return { token: "", igId: "" };
}

async function tokensFor(supabase: any, account: string) {
  const { data } = await supabase
    .from("instagram_credentials")
    .select("access_token, ig_business_id")
    .eq("account", account)
    .maybeSingle();
  const env = await envTokenFor(account);
  const token = sanitizeToken(data?.access_token || env.token);
  const igId = (data?.ig_business_id || env.igId || "").toString().trim();
  return { token, igId };
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
            `Você adapta comentários curtos de CTA para Reels do Instagram. Regras absolutas:\n` +
            `- Contexto do produto: "${ctx.product}" (mas NÃO cite o nome no comentário — o CTA aponta para a BIO).\n` +
            `- PROIBIDO incluir links, URLs, domínios, "http", "www", códigos de afiliado, @menções ou hashtags.\n` +
            `- Sempre direcionar o público para a BIO do perfil (use "na BIO 👆" ou equivalente natural).\n` +
            `- Mantenha o tom, a estrutura, os emojis e o número de linhas do modelo.\n` +
            `- Ajuste levemente a primeira frase para conversar com o tema do vídeo.\n` +
            `- Máximo 280 caracteres.\n` +
            `- Nada de frases genéricas tipo "novo post", "confira", "segue a gente".\n` +
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
    if (body.instagram_post_id) {
      const { data } = await supabase.from("instagram_posts").select("*").eq("id", body.instagram_post_id).maybeSingle();
      post = data;
    } else {
      post = {
        publish_id: body.publish_id, video_id: body.video_id, account: body.account,
        title: body.title, description: body.description,
      };
    }
    if (!post?.publish_id) throw new Error("publish_id (ig media id) ausente.");
    if (!post?.account) throw new Error("account ausente.");
    if (!post?.video_id) throw new Error("video_id ausente.");

    // Descobre project_id
    const { data: video } = await supabase.from("videos").select("project_id, prompt").eq("id", post.video_id).maybeSingle();
    if (!video?.project_id) throw new Error("Projeto do vídeo não encontrado.");

    // Config do afiliado (isolada por projeto — nunca mistura)
    const { data: cfg } = await supabase.from("project_affiliate_configs")
      .select("*").eq("project_id", video.project_id).eq("is_active", true).maybeSingle();
    if (!cfg) return new Response(JSON.stringify({ skipped: "sem configuração ativa para este projeto" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Modelos ativos, rotação por last_used_at
    const { data: templates } = await supabase.from("project_comment_templates")
      .select("*").eq("project_id", video.project_id).eq("is_active", true)
      .order("last_used_at", { ascending: true, nullsFirst: true }).order("position", { ascending: true });
    if (!templates?.length) return new Response(JSON.stringify({ skipped: "sem modelos de comentário" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const tpl = templates[0];
    const adapted = await adaptWithAI(tpl.template, {
      title: post.caption ?? undefined,
      description: video.prompt ?? post.description ?? undefined,
      product: cfg.product_name,
    });
    const finalText = (stripLinks(adapted) || stripLinks(tpl.template)).slice(0, 280);
    if (!finalText) return new Response(JSON.stringify({ skipped: "texto vazio após sanitização" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { token } = await tokensFor(supabase, post.account);
    if (!token) throw new Error("token do Instagram ausente para esta conta.");
    const base = baseForToken(token);

    const url = `${base}/${encodeURIComponent(post.publish_id)}/comments`;
    const form = new URLSearchParams({ message: finalText, access_token: token });
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j?.error?.message ?? `HTTP ${r.status}`;
      console.error("[instagram-post-comment] erro:", msg, JSON.stringify(j));
      return new Response(JSON.stringify({ error: msg, details: j, text: finalText }), {
        status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const commentId = j?.id ?? null;
    await supabase.from("project_comment_templates").update({ last_used_at: new Date().toISOString() }).eq("id", tpl.id);
    return new Response(JSON.stringify({
      success: true, comment_id: commentId, text: finalText,
      note: "A API pública do Instagram não permite fixar comentários programaticamente.",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[instagram-post-comment]", e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
