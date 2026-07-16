import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FolderKanban,
  Film,
  Rocket,
  CheckCircle2,
  HardDrive,
  Plus,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/format";

type Stats = {
  projects: number;
  uploaded: number;
  processed: number;
  finished: number;
  bytes: number;
};

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: any;
}) {
  return (
    <Card className="glass border-border/40 relative overflow-hidden">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gold/10 blur-2xl" />
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-card/60">
            <Icon size={14} className="text-gold" />
          </div>
        </div>
        <div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const [p, uploaded, processed, finished, sizes] = await Promise.all([
        supabase.from("projects").select("*", { count: "exact", head: true }),
        supabase.from("videos").select("*", { count: "exact", head: true }),
        supabase
          .from("videos")
          .select("*", { count: "exact", head: true })
          .eq("status", "processing"),
        supabase
          .from("videos")
          .select("*", { count: "exact", head: true })
          .eq("status", "finished"),
        supabase.from("videos").select("size_bytes"),
      ]);
      const bytes = (sizes.data ?? []).reduce(
        (a: number, r: any) => a + (r.size_bytes ?? 0),
        0
      );
      setStats({
        projects: p.count ?? 0,
        uploaded: uploaded.count ?? 0,
        processed: processed.count ?? 0,
        finished: finished.count ?? 0,
        bytes,
      });
    })();
  }, []);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-border/50 glass p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gold/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-widest text-gold">
              <Sparkles size={12} /> Fábrica pessoal
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Produção em massa de vídeos para{" "}
              <span className="text-gold">Reels, TikTok e Shorts</span>
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              Envie centenas de vídeos originais, escolha um template e sua identidade
              visual, e gere lotes prontos para publicação manual.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
            <Button asChild size="lg" className="bg-gold-gradient text-black hover:opacity-90 glow-gold">
              <Link to="/projects">
                <Plus className="mr-2" size={16} /> Novo Projeto
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-border/60">
              <Link to="/videos">
                Enviar vídeos <ArrowUpRight className="ml-1" size={14} />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {!stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Projetos" value={stats.projects} icon={FolderKanban} />
          <StatCard label="Vídeos enviados" value={stats.uploaded} icon={Film} />
          <StatCard label="Processando" value={stats.processed} icon={Rocket} />
          <StatCard label="Finalizados" value={stats.finished} icon={CheckCircle2} />
          <StatCard
            label="Armazenamento"
            value={formatBytes(stats.bytes)}
            icon={HardDrive}
            hint="Uso total"
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {[
          { title: "1. Crie um projeto", desc: "Organize por página/perfil ou categoria.", to: "/projects" },
          { title: "2. Envie os vídeos", desc: "Upload individual ou em massa.", to: "/videos" },
          { title: "3. Gere e baixe", desc: "Escolha template e sua marca, gere em lote.", to: "/processing" },
        ].map((s) => (
          <Link
            key={s.title}
            to={s.to}
            className="group rounded-xl border border-border/50 glass p-5 transition-all hover:-translate-y-0.5 hover:border-gold/40 hover:glow-gold"
          >
            <div className="text-[11px] uppercase tracking-wider text-gold">Passo</div>
            <div className="mt-2 text-base font-medium">{s.title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
            <div className="mt-4 inline-flex items-center gap-1 text-xs text-gold opacity-0 transition-opacity group-hover:opacity-100">
              Acessar <ArrowUpRight size={12} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
