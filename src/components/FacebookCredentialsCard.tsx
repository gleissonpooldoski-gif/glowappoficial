import { useEffect, useState } from "react";
import { Facebook, Plus, Trash2, RefreshCw, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, Link as LinkIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type FbAccount = {
  id: string;
  project_id: string | null;
  page_id: string;
  page_name: string;
  page_picture: string | null;
  connected_at: string;
  connection_logs?: any[];
  connection_status?: "connected" | "expired";
  token_checked_at?: string | null;
  token_error?: string | null;
};

type Project = { id: string; name: string };

type FbPage = {
  page_id: string;
  page_name: string;
  page_picture: string | null;
  page_access_token: string;
};

export default function FacebookCredentialsCard() {
  const [accounts, setAccounts] = useState<FbAccount[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [swapAccount, setSwapAccount] = useState<FbAccount | null>(null);
  const [projectId, setProjectId] = useState<string>("");
  const [userToken, setUserToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [pages, setPages] = useState<FbPage[] | null>(null);
  const [selectedPage, setSelectedPage] = useState<string>("");
  const [fetchingPages, setFetchingPages] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [toDelete, setToDelete] = useState<FbAccount | null>(null);

  const load = async () => {
    setLoading(true);
    const [accRes, projRes] = await Promise.all([
      supabase.functions.invoke("facebook-credentials", { body: { action: "list", validate: true } }),
      supabase.from("projects").select("id, name").order("name", { ascending: true }),
    ]);
    setLoading(false);
    if (accRes.error) return toast.error(accRes.error.message);
    setAccounts((accRes.data?.accounts ?? []) as FbAccount[]);
    setProjects((projRes.data ?? []) as Project[]);
  };

  useEffect(() => { load(); }, []);

  const openConnect = (existing?: FbAccount) => {
    setSwapAccount(existing ?? null);
    setProjectId(existing?.project_id ?? "");
    setUserToken("");
    setShowToken(false);
    setPages(null);
    setSelectedPage("");
    setDialogOpen(true);
  };

  const loadPages = async () => {
    if (!userToken.trim()) return toast.error("Cole seu Access Token do Meta.");
    setFetchingPages(true);
    const { data, error } = await supabase.functions.invoke("facebook-credentials", {
      body: { action: "list_pages", user_access_token: userToken.trim() },
    });
    setFetchingPages(false);
    if (error) {
      const ctx: any = (error as any).context;
      let msg = error.message;
      try {
        if (ctx?.text) { const parsed = JSON.parse(await ctx.text()); if (parsed?.error) msg = parsed.error; }
      } catch { /* ignore */ }
      return toast.error(msg);
    }
    if (data?.error) return toast.error(data.error);
    const list = (data?.pages ?? []) as FbPage[];
    setPages(list);
    if (list.length === 0) toast.info("Nenhuma Página encontrada para este token.");
  };

  const connect = async () => {
    if (!projectId) return toast.error("Selecione o projeto.");
    if (!selectedPage) return toast.error("Selecione uma Página.");
    setConnecting(true);
    const { data, error } = await supabase.functions.invoke("facebook-credentials", {
      body: { action: "connect", project_id: projectId, user_access_token: userToken.trim(), page_id: selectedPage },
    });
    setConnecting(false);
    if (error) {
      const ctx: any = (error as any).context;
      let msg = error.message;
      try { if (ctx?.text) { const p = JSON.parse(await ctx.text()); if (p?.error) msg = p.error; } } catch { /* */ }
      return toast.error(msg);
    }
    if (data?.error) return toast.error(data.error);
    const recovered = Number(data?.recovered_count ?? 0);
    toast.success(recovered > 0 ? `Página conectada. ${recovered} agendamento(s) recuperado(s).` : "Página conectada.");
    setDialogOpen(false);
    load();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const id = toDelete.id;
    setToDelete(null);
    const { error, data } = await supabase.functions.invoke("facebook-credentials", {
      body: { action: "disconnect", id },
    });
    if (error) return toast.error(error.message);
    if (data?.error) return toast.error(data.error);
    toast.success("Página desconectada.");
    load();
  };

  const projectName = (id: string | null) =>
    id ? (projects.find((p) => p.id === id)?.name ?? "—") : "Sem projeto vinculado";

  return (
    <Card className="glass border-border/50">
      <CardContent className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Facebook size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Páginas do Facebook conectadas</h2>
              <p className="text-xs text-muted-foreground">
                Etapa 1: conectar uma Página por projeto usando login Meta. Publicação será liberada em etapa seguinte.
              </p>
            </div>
          </div>
          <Button onClick={() => openConnect()} className="bg-blue-600 text-white hover:bg-blue-700 shrink-0">
            <Plus size={14} className="mr-1" /> Conectar Facebook
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {loading && <div className="col-span-full text-center text-sm text-muted-foreground">Carregando…</div>}
          {!loading && accounts.length === 0 && (
            <div className="col-span-full text-center text-sm text-muted-foreground">
              Nenhuma Página conectada. Clique em "Conectar Facebook".
            </div>
          )}
          {accounts.map((a) => {
            const expired = a.connection_status === "expired";
            return (
            <div key={a.id} className="space-y-3 rounded-lg border border-border/50 bg-card/40 p-4">
              <div className="flex items-start gap-3">
                {a.page_picture ? (
                  <img src={a.page_picture} alt={a.page_name} className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white">
                    <Facebook size={20} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{a.page_name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">Projeto: {projectName(a.project_id)}</p>
                  <p className="text-[11px] text-muted-foreground">Page ID: {a.page_id}</p>
                  <div className={`mt-1 flex items-center gap-1 text-xs ${expired ? "text-destructive" : "text-emerald-500"}`}>
                    {expired ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
                    {expired ? "Token expirado" : "Página conectada"}
                  </div>
                  {expired && a.token_error && (
                    <p className="mt-1 text-[10px] text-destructive">{a.token_error}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => openConnect(a)}>
                  <RefreshCw size={13} className="mr-1" /> {expired ? "Reconectar Facebook" : "Trocar Página"}
                </Button>
                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => setToDelete(a)}>
                  <Trash2 size={13} className="mr-1" /> Desconectar
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Conectado em {new Date(a.connected_at).toLocaleString()}
              </p>
            </div>
            );
          })}
        </div>

        {/* Connect dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{swapAccount ? "Trocar Página do Facebook" : "Conectar Facebook"}</DialogTitle>
              <DialogDescription>
                Cole seu <b>Access Token do Meta</b> (Graph API Explorer ou Meta Business Login) com as permissões
                <code className="mx-1">pages_show_list</code>,
                <code className="mx-1">pages_read_engagement</code> e
                <code className="mx-1">pages_manage_posts</code>. Vamos listar as Páginas que você administra.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Projeto</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar projeto" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Access Token do Meta (User Token)</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showToken ? "text" : "password"}
                      placeholder="EAAG..."
                      value={userToken}
                      onChange={(e) => setUserToken(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label={showToken ? "Ocultar" : "Mostrar"}
                    >
                      {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <Button type="button" onClick={loadPages} disabled={fetchingPages || !userToken.trim()}>
                    {fetchingPages ? <Loader2 size={14} className="mr-1 animate-spin" /> : <LinkIcon size={14} className="mr-1" />}
                    Buscar Páginas
                  </Button>
                </div>
              </div>

              {pages && pages.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs">Escolha a Página</Label>
                  <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg border border-border/50 p-2">
                    {pages.map((p) => (
                      <label
                        key={p.page_id}
                        className={`flex items-center gap-3 rounded-md p-2 cursor-pointer transition ${
                          selectedPage === p.page_id ? "bg-blue-600/20 border border-blue-600/50" : "hover:bg-muted/40"
                        }`}
                      >
                        <input
                          type="radio"
                          name="fb-page"
                          checked={selectedPage === p.page_id}
                          onChange={() => setSelectedPage(p.page_id)}
                          className="sr-only"
                        />
                        {p.page_picture ? (
                          <img src={p.page_picture} alt={p.page_name} className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white">
                            <Facebook size={16} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.page_name}</p>
                          <p className="text-[10px] text-muted-foreground">ID: {p.page_id}</p>
                        </div>
                        {selectedPage === p.page_id && <CheckCircle2 size={16} className="text-blue-500" />}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={connect} disabled={connecting || !selectedPage || !projectId} className="bg-blue-600 text-white hover:bg-blue-700">
                {connecting ? <Loader2 size={14} className="mr-1 animate-spin" /> : <CheckCircle2 size={14} className="mr-1" />}
                Conectar Página
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desconectar Página do Facebook?</AlertDialogTitle>
              <AlertDialogDescription>
                A Página <b>{toDelete?.page_name}</b> será removida do projeto. Você poderá reconectar depois.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
                Desconectar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
