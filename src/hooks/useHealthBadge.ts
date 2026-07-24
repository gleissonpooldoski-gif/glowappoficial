import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useHealthBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [{ count: q }, { count: h }] = await Promise.all([
        supabase.from("publish_queue").select("*", { count: "exact", head: true }).in("status", ["NEEDS_ATTENTION", "FAILED"]),
        supabase.from("connection_health").select("*", { count: "exact", head: true }).eq("status", "expired"),
      ]);
      setCount((q ?? 0) + (h ?? 0));
    };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  return count;
}
