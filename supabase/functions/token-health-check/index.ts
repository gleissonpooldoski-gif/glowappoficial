// Verifica saúde de todos os tokens (IG/FB/YT/TT) e grava em connection_health.
// Roda diariamente via pg_cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const GRAPH = "https://graph.facebook.com/v21.0";

type Result = { platform: string; account_ref: string; status: string; error?: string; expires_at?: string };

async function upsertHealth(row: Result & { project_id?: string | null; metadata?: Record<string, unknown> }) {
  const { platform, account_ref, status, error, expires_at, project_id, metadata } = row;
  await supabase
    .from("connection_health")
    .upsert({
      platform,
      account_ref,
      project_id: project_id ?? null,
      status,
      last_check: new Date().toISOString(),
      expires_at: expires_at ?? null,
      error_reason: error ?? null,
      metadata: metadata ?? {},
    }, { onConflict: "platform,account_ref" });
}

async function checkInstagram(): Promise<Result[]> {
  const { data: creds } = await supabase.from("instagram_credentials").select("account, access_token, ig_business_id, project_id");
  const results: Result[] = [];
  for (const c of creds ?? []) {
    const token = String(c.access_token || "").trim();
    if (!token) {
      await upsertHealth({ platform: "instagram", account_ref: c.account, status: "expired", error: "Sem token", project_id: c.project_id });
      results.push({ platform: "instagram", account_ref: c.account, status: "expired", error: "Sem token" });
      continue;
    }
    try {
      const r = await fetch(`${GRAPH}/${c.ig_business_id}?fields=id,username&access_token=${encodeURIComponent(token)}`);
      const data = await r.json();
      if (!r.ok || data.error) {
        const status = data?.error?.code === 190 ? "expired" : "expired";
        await upsertHealth({ platform: "instagram", account_ref: c.account, status, error: data?.error?.message || `HTTP ${r.status}`, project_id: c.project_id });
        results.push({ platform: "instagram", account_ref: c.account, status, error: data?.error?.message });
      } else {
        await upsertHealth({ platform: "instagram", account_ref: c.account, status: "connected", project_id: c.project_id });
        results.push({ platform: "instagram", account_ref: c.account, status: "connected" });
      }
    } catch (e) {
      await upsertHealth({ platform: "instagram", account_ref: c.account, status: "unknown", error: String(e), project_id: c.project_id });
      results.push({ platform: "instagram", account_ref: c.account, status: "unknown", error: String(e) });
    }
  }
  return results;
}

async function checkFacebook(): Promise<Result[]> {
  const { data: accts } = await supabase.from("facebook_accounts").select("page_id, page_name, page_access_token, project_id");
  const results: Result[] = [];
  for (const a of accts ?? []) {
    const token = String(a.page_access_token || "").trim();
    if (!token) {
      await upsertHealth({ platform: "facebook", account_ref: a.page_id, status: "expired", error: "Sem token", project_id: a.project_id, metadata: { page_name: a.page_name } });
      results.push({ platform: "facebook", account_ref: a.page_id, status: "expired", error: "Sem token" });
      continue;
    }
    try {
      const r = await fetch(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
      const data = await r.json();
      if (!r.ok || data.error) {
        const isExpired = data?.error?.code === 190;
        await supabase.from("facebook_accounts")
          .update({ connection_status: isExpired ? "expired" : "expired", token_error: data?.error?.message, token_checked_at: new Date().toISOString() })
          .eq("page_id", a.page_id);
        await upsertHealth({ platform: "facebook", account_ref: a.page_id, status: "expired", error: data?.error?.message || `HTTP ${r.status}`, project_id: a.project_id, metadata: { page_name: a.page_name } });
        results.push({ platform: "facebook", account_ref: a.page_id, status: "expired", error: data?.error?.message });
      } else {
        await supabase.from("facebook_accounts")
          .update({ connection_status: "connected", token_error: null, token_checked_at: new Date().toISOString() })
          .eq("page_id", a.page_id);
        await upsertHealth({ platform: "facebook", account_ref: a.page_id, status: "connected", project_id: a.project_id, metadata: { page_name: a.page_name } });
        results.push({ platform: "facebook", account_ref: a.page_id, status: "connected" });
      }
    } catch (e) {
      await upsertHealth({ platform: "facebook", account_ref: a.page_id, status: "unknown", error: String(e), project_id: a.project_id });
      results.push({ platform: "facebook", account_ref: a.page_id, status: "unknown", error: String(e) });
    }
  }
  return results;
}

async function checkYouTube(): Promise<Result[]> {
  const { data: creds } = await supabase.from("youtube_credentials").select("account, refresh_token, expires_at, channel_id, channel_title");
  const results: Result[] = [];
  const clientId = Deno.env.get("YOUTUBE_CLIENT_ID");
  const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET");

  for (const c of creds ?? []) {
    if (!c.refresh_token || !clientId || !clientSecret) {
      await upsertHealth({ platform: "youtube", account_ref: c.account, status: "expired", error: "Sem refresh_token" });
      results.push({ platform: "youtube", account_ref: c.account, status: "expired", error: "Sem refresh_token" });
      continue;
    }
    try {
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId, client_secret: clientSecret,
          refresh_token: c.refresh_token, grant_type: "refresh_token",
        }),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        await upsertHealth({ platform: "youtube", account_ref: c.account, status: "expired", error: data?.error_description || data?.error || `HTTP ${r.status}`, metadata: { channel_title: c.channel_title } });
        results.push({ platform: "youtube", account_ref: c.account, status: "expired", error: data?.error });
      } else {
        const newExpiresAt = new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000).toISOString();
        await supabase.from("youtube_credentials")
          .update({ access_token: data.access_token, expires_at: newExpiresAt, last_validated_at: new Date().toISOString(), last_validation_status: "ok", last_validation_detail: null })
          .eq("account", c.account);
        await upsertHealth({ platform: "youtube", account_ref: c.account, status: "connected", expires_at: newExpiresAt, metadata: { channel_title: c.channel_title } });
        results.push({ platform: "youtube", account_ref: c.account, status: "connected", expires_at: newExpiresAt });
      }
    } catch (e) {
      await upsertHealth({ platform: "youtube", account_ref: c.account, status: "unknown", error: String(e) });
      results.push({ platform: "youtube", account_ref: c.account, status: "unknown", error: String(e) });
    }
  }
  return results;
}

async function checkTikTok(): Promise<Result[]> {
  const { data: creds } = await supabase.from("tiktok_credentials").select("account, access_token, expires_at, refresh_token, refresh_expires_at");
  const results: Result[] = [];
  for (const c of creds ?? []) {
    const now = Date.now();
    const exp = c.expires_at ? new Date(c.expires_at).getTime() : 0;
    let token = c.access_token;
    let expiresAt = c.expires_at;
    // Refresh proativo se faltam menos de 6h
    if (exp && exp - now < 6 * 3600_000 && c.refresh_token) {
      try {
        const r = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_key: Deno.env.get("TIKTOK_CLIENT_KEY")!,
            client_secret: Deno.env.get("TIKTOK_CLIENT_SECRET")!,
            grant_type: "refresh_token",
            refresh_token: c.refresh_token,
          }),
        });
        const data = await r.json();
        if (r.ok && data.access_token) {
          token = data.access_token;
          expiresAt = new Date(Date.now() + Number(data.expires_in) * 1000).toISOString();
          await supabase.from("tiktok_credentials").update({
            access_token: token, expires_at: expiresAt,
            refresh_token: data.refresh_token ?? c.refresh_token,
          }).eq("account", c.account);
        }
      } catch { /* ignore, will mark expired below */ }
    }
    if (!token) {
      await upsertHealth({ platform: "tiktok", account_ref: c.account, status: "expired", error: "Sem token" });
      results.push({ platform: "tiktok", account_ref: c.account, status: "expired", error: "Sem token" });
      continue;
    }
    try {
      const r = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,username", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!r.ok || data.error?.code !== "ok") {
        await upsertHealth({ platform: "tiktok", account_ref: c.account, status: "expired", error: data?.error?.message || `HTTP ${r.status}`, expires_at: expiresAt });
        results.push({ platform: "tiktok", account_ref: c.account, status: "expired", error: data?.error?.message });
      } else {
        await upsertHealth({ platform: "tiktok", account_ref: c.account, status: "connected", expires_at: expiresAt });
        results.push({ platform: "tiktok", account_ref: c.account, status: "connected", expires_at: expiresAt });
      }
    } catch (e) {
      await upsertHealth({ platform: "tiktok", account_ref: c.account, status: "unknown", error: String(e) });
      results.push({ platform: "tiktok", account_ref: c.account, status: "unknown", error: String(e) });
    }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const [ig, fb, yt, tt] = await Promise.all([
      checkInstagram(), checkFacebook(), checkYouTube(), checkTikTok(),
    ]);
    const results = { instagram: ig, facebook: fb, youtube: yt, tiktok: tt };
    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
