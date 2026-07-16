import { useEffect, useState } from "react";
import { LayoutTemplate, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

type Template = {
  id: string;
  name: string;
  description: string | null;
  settings: any;
  is_builtin: boolean;
};

const PREVIEWS: Record<string, { bg: string; accent: string; label: string }> = {
  "Dark Gold": { bg: "linear-gradient(135deg,#050505,#111)", accent: "#D4AF37", label: "Premium" },
  "Viral Reels": { bg: "linear-gradient(135deg,#0b0b0b,#1a1a1a)", accent: "#FFE066", label: "TikTok" },
  Podcast: { bg: "linear-gradient(135deg,#0f0f14,#1c1c24)", accent: "#B8A47A", label: "Central" },
  News: { bg: "linear-gradient(135deg,#0a0a0a,#161616)", accent: "#E63946", label: "Jornal" },
  Minimal: { bg: "linear-gradient(135deg,#050505,#0d0d0d)", accent: "#FFFFFF", label: "Clean" },
};

export default function Templates() {
  const [templates, setTemplates] = useState<Template[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("templates")
        .select("*")
        .order("created_at", { ascending: true });
      setTemplates((data ?? []) as Template[]);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        <p className="text-sm text-muted-foreground">
          Estilos visuais aplicados automaticamente durante o processamento.
        </p>
      </header>

      {!templates ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const p = PREVIEWS[t.name] ?? PREVIEWS.Minimal;
            return (
              <Card
                key={t.id}
                className="glass border-border/50 group overflow-hidden transition-all hover:-translate-y-0.5 hover:border-gold/40"
              >
                <div
                  className="relative aspect-[9/12] flex items-end p-4"
                  style={{ background: p.bg }}
                >
                  <div className="pointer-events-none absolute inset-0 opacity-40" style={{
                    background: `radial-gradient(400px 200px at 50% 20%, ${p.accent}22, transparent 60%)`,
                  }} />
                  <div className="relative w-full space-y-2 text-white">
                    <div
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest"
                      style={{ background: `${p.accent}22`, color: p.accent, border: `1px solid ${p.accent}55` }}
                    >
                      <Sparkles size={10} /> {p.label}
                    </div>
                    <div className="text-lg font-semibold leading-tight" style={{ color: p.accent }}>
                      {t.name.toUpperCase()}
                    </div>
                    <div className="h-1 w-16 rounded-full" style={{ background: p.accent }} />
                  </div>
                </div>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">{t.name}</h3>
                    {t.is_builtin && (
                      <Badge variant="outline" className="border-gold/30 text-[10px] text-gold">
                        Nativo
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {t.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="glass border-dashed">
        <CardContent className="flex items-center gap-3 py-4 text-xs text-muted-foreground">
          <LayoutTemplate size={14} className="text-gold" />
          Novos templates personalizados poderão ser criados após integração com o renderizador (FFmpeg).
        </CardContent>
      </Card>
    </div>
  );
}
