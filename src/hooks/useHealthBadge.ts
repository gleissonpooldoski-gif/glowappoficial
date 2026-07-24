import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Conta exatamente o que a página /publications-issues mostra:
// posts com status=ERRO em cada rede + contas com token expirado.
// Assim, quando o usuário resolve (retry → AGENDADO) o sino zera.
export function useHealthBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const head = { count: "exact" as const, head: true };
      const [ig, fb, yt, tt, hh] = await Promise.all([
        supabase.from("instagram_posts").select("*", head).eq("status", "ERRO"),
        supabase.from("facebook_posts").select("*", head).eq("status", "ERRO"),
        supabase.from("youtube_posts").select("*", head).eq("status", "ERRO"),
        supabase.from("tiktok_posts").select("*", head).eq("status", "ERRO"),
        supabase.from("connection_health").select("*", head).eq("status", "expired"),
      ]);
      const total =
        (ig.count ?? 0) +
        (fb.count ?? 0) +
        (yt.count ?? 0) +
        (tt.count ?? 0) +
        (hh.count ?? 0);
      setCount(total);
    };
    load();
    const t = setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return count;
}
