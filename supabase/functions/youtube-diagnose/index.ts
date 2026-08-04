// Diagnóstico de um canal do YouTube: valida token, lista o canal e testa a
// abertura de uma sessão resumable (sem enviar bytes) para revelar o motivo
// exato de erros 403 na publicação.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { ensureAccessToken, resolveYoutubeCredential } from "../_shared/youtube-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const out: Record<string, unknown> = {};
  try {
    const body = await req.json().catch(() => ({}));
    const cred = await resolveYoutubeCredential(supabase, { account: body.account, projectId: body.project_id ?? null });
    out.account = cred.account;
    out.channel_title = cred.channel_title;
    out.scope = cred.scope;
    const token = await ensureAccessToken(supabase, cred);

    const chRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=id,snippet,status,contentDetails&mine=true",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    out.channels_status = chRes.status;
    out.channels_body = (await chRes.text()).slice(600, 4000);

    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "video/mp4",
          "X-Upload-Content-Length": "1048576",
        },
        body: JSON.stringify({
          snippet: { title: "diagnostic", description: "", tags: [], categoryId: "22" },
          status: { privacyStatus: "private", selfDeclaredMadeForKids: false },
        }),
      },
    );
    out.resumable_status = initRes.status;
    out.resumable_body = (await initRes.text()).slice(0, 1500);
    return new Response(JSON.stringify(out, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ...out, error: e?.message ?? String(e), code: e?.code ?? null }, null, 2), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
