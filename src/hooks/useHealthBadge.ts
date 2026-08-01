import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Conta o que a página /publications-issues mostra (posts com status=ERRO)
// e, separadamente, as contas com token expirado — para o sino descrever
// exatamente o que precisa de ação.
export function useHealthBadge() {
  const [posts, setPosts] = useState(0);
  const [connections, setConnections] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const head = { count: "exact" as const, head: true };
      const [ig, fb, yt, tt, hh] = await Promise.all([
        supabase.from("instagram_posts").select("*", head).eq("status", "ERRO"),
        supabase.from("facebook_posts").select("*", head).eq("status", "ERRO"),
        supabase.from("youtube_posts").select("*", head).eq("status", "ERRO"),
        supabase.from("tiktok_posts").select("*", head).eq("status", "ERRO"),
        supabase.from("connection_health").select("*", head).eq("status", "expired"),
      ]);
      if (cancelled) return;
      setPosts((ig.count ?? 0) + (fb.count ?? 0) + (yt.count ?? 0) + (tt.count ?? 0));
      setConnections(hh.count ?? 0);
    };
    load();
    const t = setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return { posts, connections, total: posts + connections };
}
