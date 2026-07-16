// Edge Function: render-video (DEPRECATED)
// Rendering now happens client-side (canvas + MediaRecorder) inside the Editor,
// so this endpoint no longer copies the original file or publishes anything.
// Kept only so old clients don't get a 404 while the frontend rolls out.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(
    JSON.stringify({
      ok: false,
      deprecated: true,
      message:
        "Renderização agora é feita no navegador. Atualize o app para usar a exportação client-side.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
