// Auto-refresh de tokens: renova YouTube (via refresh_token) e valida Meta (IG/FB).
// Marca em connection_health e cria alertas antecipados (7 dias antes de expirar).
// Roda diariamente às 05:00 UTC via pg_cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const EARLY_WARNING_DAYS = 7;

async function upsertHealth(platform: string, accountRef: string, projectId: string | null, patch: Record<string, unknown>) {
  await supabase.from("connection_health").upsert({
    platform, account_ref: accountRef, project_id: projectId,
    last_check: new Date().toISOString(),
    ...patch,
  }, { onConflict: "platform,account_ref" });
}

// ---------- YOUTUBE ----------
async function refreshYouTube() {
  const results: any[] = [];
  const clientId = Deno.env.get("YOUTUBE_CLIENT_ID");
  const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return { skipped: "missing_credentials" };

  const { data: creds } = await supabase.from("youtube_credentials")
    .select("id, account, channel_id, channel_title, refresh_token, expires_at, project_id");

  for (const c of creds ?? []) {
    if (!c.refresh_token) {
      await upsertHealth("youtube", c.account ?? c.channel_id ?? c.id, c.project_id, {
        status: "needs_reconnect", error_reason: "missing_refresh_token", error_code: "NO_REFRESH",
      });
      results.push({ id: c.id, status: "no_refresh_token" });
      continue;
    }
    try {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId, client_secret: clientSecret,
          refresh_token: c.refresh_token, grant_type: "refresh_token",
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        await upsertHealth("youtube", c.account ?? c.channel_id ?? c.id, c.project_id, {
          status: "needs_reconnect", error_reason: body?.error_description ?? body?.error ?? "refresh_failed",
          error_code: String(body?.error ?? res.status),
        });
        results.push({ id: c.id, status: "failed", error: body?.error });
        continue;
      }
      const newExpires = new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString();
      await supabase.from("youtube_credentials").update({
        access_token: body.access_token,
        expires_at: newExpires,
        last_validated_at: new Date().toISOString(),
        last_validation_status: "ok",
        last_validation_detail: "refreshed",
        updated_at: new Date().toISOString(),
      }).eq("id", c.id);
      await upsertHealth("youtube", c.account ?? c.channel_id ?? c.id, c.project_id, {
        status: "connected", expires_at: newExpires, error_reason: null, error_code: null,
      });
      results.push({ id: c.id, status: "refreshed", expires_at: newExpires });
    } catch (e) {
      results.push({ id: c.id, status: "exception", error: (e as Error).message });
    }
  }
  return { count: results.length, results };
}

// ---------- META (IG + FB) ----------
async function validateMetaToken(token: string) {
  // debug_token requer app token; usamos /me como fallback simples
  const res = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(token)}`);
  const body = await res.json();
  return { ok: res.ok && !body?.error, error: body?.error, status: res.status };
}

async function validateMetaWithExpiry(token: string) {
  // Tenta debug_token com o próprio token (funciona quando é user token; page tokens não expiram se derivados de long-lived)
  const res = await fetch(
    `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`
  );
  const body = await res.json();
  if (!res.ok || body?.data?.error) return { valid: false, expires_at: null, error: body?.data?.error?.message ?? body?.error?.message };
  const expiresSec = body?.data?.expires_at;
  return {
    valid: !!body?.data?.is_valid,
    expires_at: expiresSec && expiresSec > 0 ? new Date(expiresSec * 1000).toISOString() : null,
    error: null,
  };
}

async function checkInstagram() {
  const results: any[] = [];
  const { data: creds } = await supabase.from("instagram_credentials")
    .select("id, account, access_token, project_id");
  for (const c of creds ?? []) {
    if (!c.access_token) continue;
    const info = await validateMetaWithExpiry(c.access_token);
    const now = Date.now();
    let status = "connected";
    let reason: string | null = null;
    if (!info.valid) {
      status = "needs_reconnect";
      reason = info.error ?? "invalid_token";
    } else if (info.expires_at) {
      const daysLeft = (new Date(info.expires_at).getTime() - now) / 86400000;
      if (daysLeft < EARLY_WARNING_DAYS) {
        status = "expiring_soon";
        reason = `expira em ${Math.round(daysLeft)}d`;
      }
    }
    await supabase.from("instagram_credentials").update({
      last_validated_at: new Date().toISOString(),
      last_validation_status: status === "connected" ? "ok" : status,
      last_validation_detail: reason,
    }).eq("id", c.id);
    await upsertHealth("instagram", c.account ?? c.id, c.project_id, {
      status, expires_at: info.expires_at, error_reason: reason, error_code: !info.valid ? "META_INVALID" : null,
    });
    results.push({ id: c.id, status, expires_at: info.expires_at });
  }
  return { count: results.length, results };
}

function isMetaAuthError(err: any): boolean {
  if (!err) return false;
  const code = Number(err.code);
  const sub = Number(err.error_subcode ?? 0);
  if (err.is_transient === true) return false;
  if ([1, 2, 4, 17, 32, 341, 613].includes(code)) return false;
  if ([190, 102, 463, 467].includes(code)) return true;
  if ([458, 459, 460, 463, 464, 467, 492, 493].includes(sub)) return true;
  const msg = String(err.message ?? "").toLowerCase();
  return msg.includes("access token") && (msg.includes("expired") || msg.includes("invalid") || msg.includes("session"));
}

/**
 * Auto-heal: tenta re-derivar o Page Access Token a partir do user token
 * armazenado (long-lived). Retorna o novo page token ou null.
 */
async function rederivePageToken(userToken: string | null, pageId: string): Promise<string | null> {
  if (!userToken || !pageId) return null;
  const appId = Deno.env.get("FACEBOOK_APP_ID");
  const appSecret = Deno.env.get("FACEBOOK_APP_SECRET");
  let token = userToken;
  if (appId && appSecret) {
    const ex = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(userToken)}`);
    const exBody = await ex.json().catch(() => ({}));
    if (ex.ok && exBody?.access_token) token = exBody.access_token;
  }
  const r = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}?fields=access_token&access_token=${encodeURIComponent(token)}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body?.error || !body?.access_token) return null;
  return String(body.access_token);
}

async function checkFacebook() {
  const results: any[] = [];
  const { data: accts } = await supabase.from("facebook_accounts")
    .select("id, page_id, page_name, page_access_token, user_access_token, project_id");
  for (const a of accts ?? []) {
    if (!a.page_access_token) continue;
    // Page tokens de longa duração não expiram: valida com /me (debug_token
    // com o próprio page token gera falsos negativos e desconectava a página).
    let ok = false;
    let err: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(a.page_access_token)}`);
      const body = await res.json().catch(() => ({}));
      err = body?.error ?? null;
      ok = res.ok && !err;
      if (ok || isMetaAuthError(err)) break;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }

    if (ok) {
      await supabase.from("facebook_accounts").update({
        connection_status: "connected", token_error: null, token_checked_at: new Date().toISOString(),
      }).eq("id", a.id);
      await upsertHealth("facebook", a.page_id ?? a.id, a.project_id, {
        status: "connected", error_reason: null, error_code: null,
      });
      results.push({ id: a.id, page: a.page_name, status: "connected" });
      continue;
    }

    if (isMetaAuthError(err)) {
      await supabase.from("facebook_accounts").update({
        connection_status: "expired", token_error: err?.message ?? "Token inválido", token_checked_at: new Date().toISOString(),
      }).eq("id", a.id);
      await upsertHealth("facebook", a.page_id ?? a.id, a.project_id, {
        status: "expired", error_reason: err?.message ?? "invalid_token", error_code: "META_INVALID",
      });
      results.push({ id: a.id, page: a.page_name, status: "expired" });
      continue;
    }

    // Transitório: NÃO desconecta
    await upsertHealth("facebook", a.page_id ?? a.id, a.project_id, {
      status: "unknown", error_reason: `transitório: ${err?.message ?? "sem resposta"}`, error_code: null,
    });
    results.push({ id: a.id, page: a.page_name, status: "transient" });
  }
  return { count: results.length, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const [yt, ig, fb] = await Promise.all([refreshYouTube(), checkInstagram(), checkFacebook()]);
    return new Response(JSON.stringify({ ok: true, youtube: yt, instagram: ig, facebook: fb }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
