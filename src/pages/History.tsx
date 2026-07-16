import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search } from "lucide-react";

type Log = {
  id: string;
  status: "published" | "scheduled" | "error" | string;
  network: string;
  caption: string | null;
  published_at: string;
  error: string | null;
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  published: "default",
  scheduled: "secondary",
  failed: "destructive",
};

export default function History() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [network, setNetwork] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("publication_logs")
        .select("id, status, network, caption, published_at, error")
        .order("published_at", { ascending: false })
        .limit(200);
      setLogs((data ?? []) as Log[]);
      setLoading(false);
    })();
  }, [user?.id]);

  const filtered = useMemo(
    () =>
      logs.filter((l) => {
        if (status !== "all" && l.status !== status) return false;
        if (network !== "all" && l.network !== network) return false;
        if (query && !(l.caption ?? "").toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [logs, status, network, query]
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Histórico</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe todas as publicações realizadas e seus resultados.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Pesquisar legenda..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="published">Publicado</SelectItem>
            <SelectItem value="scheduled">Agendado</SelectItem>
            <SelectItem value="failed">Erro</SelectItem>
          </SelectContent>
        </Select>
        <Select value={network} onValueChange={setNetwork}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="Rede" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas redes</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="tiktok">TikTok</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Rede</TableHead>
              <TableHead>Legenda</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Resultado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum registro. As publicações aparecerão aqui após as integrações serem
                  ativadas.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Badge variant={statusVariant[l.status] ?? "outline"} className="capitalize">
                      {l.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize text-sm">{l.network}</TableCell>
                  <TableCell className="max-w-[320px] truncate text-sm">
                    {l.caption || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(l.published_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                    {l.error ?? "OK"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
