import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { NetworkIcon } from "@/components/NetworkIcon";

interface LogRow {
  id: string;
  published_at: string;
  network: "instagram" | "tiktok";
  status: string;
  caption: string | null;
  result: any;
  error: string | null;
}

export default function History() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("publication_logs").select("*").order("published_at", { ascending: false });
      setRows((data ?? []) as any);
      setLoading(false);
    })();
  }, [user]);

  const statusBadge = (s: string) => {
    if (s === "published") return <Badge className="bg-success text-success-foreground hover:bg-success/90">Publicado</Badge>;
    if (s === "failed") return <Badge variant="destructive">Erro</Badge>;
    if (s === "scheduled") return <Badge variant="secondary">Agendado</Badge>;
    return <Badge variant="outline">{s}</Badge>;
  };

  return (
    <div>
      <PageHeader title="Histórico" description="Registro de todas as publicações" />

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Rede</TableHead>
              <TableHead>Legenda</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead>Erro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">Nenhum histórico ainda</TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="text-xs">{format(new Date(r.published_at), "d MMM yyyy, HH:mm", { locale: ptBR })}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <NetworkIcon network={r.network} className={`h-3.5 w-3.5 ${r.network === "instagram" ? "text-instagram" : "text-tiktok"}`} />
                      <span className="text-xs capitalize">{r.network}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{r.caption || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.result ? JSON.stringify(r.result).slice(0, 40) : "—"}</TableCell>
                  <TableCell className="text-xs text-destructive max-w-xs truncate">{r.error || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
