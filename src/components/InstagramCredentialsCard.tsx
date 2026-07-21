import { useEffect, useMemo, useState } from "react";
import { Instagram, Save, Eye, EyeOff, CheckCircle2, XCircle, Loader2, RefreshCw, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Stored = {
  account: string;
  ig_business_id: string;
  display_name: string | null;
  project_id: string | null;
  updated_at: string;
  last_validation_status?: string;
  last_validation_detail?: string;
};

type Project = { id: string; name: string };

type Validation = { ok: boolean; status: string; message: string; username?: string | null };

const STATUS_LABEL: Record<string, string> = {
  VALID: "✅ Token válido",
  TOKEN_INVALID: "❌ Token inválido",
  TOKEN_EXPIRED: "❌ Token expirado",
  IG_ID_INVALID: "❌ Instagram Business ID inválido",
  PERMISSION_MISSING: "❌ Permissão insuficiente",
  API_BLOCKED: "🚫 Bloqueado pela API — necessita reautenticação",
  EMPTY: "— Campos vazios",
  UNKNOWN_ERROR: "❌ Erro ao validar",
};

const LEGACY_LABEL: Record<string, string> = {
  resenha: "Sessão da Resenha",
  frame: "Sessão da Frame",
};

export default function InstagramCredentialsCard() {
  const [stored, setStored] = useState<Record<string, Stored>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [validatingAccount, setValidatingAccount] = useState<string | null>(null);
  const [savingAccount, setSavingAccount] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Validation>>({});

  // Per-card editable form (token only + project selection)
  const [edits, setEdits] = useState<Record<string, { token: string; project_id: string | null; showToken: boolean }>>({});

  // "Nova conta" dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({
    display_name: "",
    project_id: "" as string,
    ig_business_id: "",
    access_token: "",
    showToken: false,
  });

  // Delete confirmation
  const [toDelete, setToDelete] = useState<Stored | null>(null);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: credRes, error: credErr }, projRes] = await Promise.all([
      supabase.functions.invoke("instagram-credentials", { body: { action: "get" } }),
      supabase.from("projects").select("id, name").order("name", { ascending: true }),
    ]);
    setLoading(false);
    if (credErr) return toast.error(credErr.message);
    const creds = (credRes?.credentials ?? {}) as Record<string, Stored>;
    setStored(creds);
    setProjects((projRes.data ?? []) as Project[]);
    // reset editable state per account
    const nextEdits: typeof edits = {};
    for (const k of Object.keys(creds)) {
      nextEdits[k] = { token: "", project_id: creds[k].project_id ?? null, showToken: false };
    }
    setEdits(nextEdits);
  };

  useEffect(() => { loadAll(); }, []);

  const orderedAccounts = useMemo(
    () => Object.values(stored).sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1)),
    [stored],
  );

  const updateEdit = (account: string, patch: Partial<{ token: string; project_id: string | null; showToken: boolean }>) =>
    setEdits((s) => ({ ...s, [account]: { ...(s[account] ?? { token: "", project_id: null, showToken: false }), ...patch } }));

  const saveAccount = async (account: string) => {
    const e = edits[account];
    if (!e) return;
    setSavingAccount(account);
    const body = {
      action: "save",
      accounts: [{
        account,
        access_token: e.token.trim() || undefined,     // não sobrescreve se vazio
        ig_business_id: e.token.trim() ? stored[account].ig_business_id : undefined,
        display_name: stored[account].display_name ?? undefined,
        project_id: e.project_id,
      }],
    };
    const { data, error } = await supabase.functions.invoke("instagram-credentials", { body });
    setSavingAccount(null);
    if (error) return toast.error(error.message);
    if (data?.results?.[account]) {
      setResults((prev) => ({ ...prev, [account]: data.results[account] }));
    }
    toast.success("Conta atualizada.");
    loadAll();
  };

  const revalidate = async (account: string) => {
    setValidatingAccount(account);
    const { data, error } = await supabase.functions.invoke("instagram-credentials", {
      body: { action: "validate", account },
    });
    setValidatingAccount(null);
    if (error) return toast.error(error.message);
    setResults((prev) => ({ ...prev, [account]: data?.result }));
    loadAll();
  };

  const createAccount = async () => {
    if (!newForm.display_name.trim() || !newForm.access_token.trim() || !newForm.ig_business_id.trim()) {
      toast.error("Preencha nome, Business ID e Access Token.");
      return;
    }
    if (!/^\d{6,20}$/.test(newForm.ig_business_id.trim())) {
      toast.error("Instagram Business ID deve conter apenas dígitos (ex.: 17841400000000000). Não use @username, URL ou ID de Página do Facebook.");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("instagram-credentials", {
      body: {
        action: "create",
        display_name: newForm.display_name.trim(),
        access_token: newForm.access_token.trim(),
        ig_business_id: newForm.ig_business_id.trim(),
        project_id: newForm.project_id || null,
      },
    });
    setCreating(false);
    if (error) {
      // Extrai a mensagem real da Meta do corpo da resposta (FunctionsHttpError esconde por padrão)
      let msg = error.message ?? "Falha ao validar a conta.";
      try {
        const ctx: any = (error as any).context;
        if (ctx && typeof ctx.text === "function") {
          const raw = await ctx.text();
          const parsed = JSON.parse(raw);
          if (parsed?.error) msg = parsed.error;
        }
      } catch { /* mantém msg */ }
      return toast.error(msg, { duration: 10000 });
    }
    if (data?.error) return toast.error(data.error, { duration: 10000 });
    toast.success(`Conta criada: ${data?.result?.message ?? "OK"}`);
    setCreateOpen(false);
    setNewForm({ display_name: "", project_id: "", ig_business_id: "", access_token: "", showToken: false });
    loadAll();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const account = toDelete.account;
    setToDelete(null);
    const { data, error } = await supabase.functions.invoke("instagram-credentials", {
      body: { action: "delete", account },
    });
    if (error) return toast.error(error.message);
    if (data?.error) return toast.error(data.error);
    toast.success("Conta removida.");
    loadAll();
  };

  const projectName = (id: string | null) =>
    id ? (projects.find((p) => p.id === id)?.name ?? "—") : "Sem projeto vinculado";

  return (
    <Card className="glass border-border/50">
      <CardContent className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-gradient text-black">
              <Instagram size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Contas Instagram conectadas</h2>
              <p className="text-xs text-muted-foreground">
                Cada conta possui token, Business ID e projeto vinculado próprios.
                Adicione quantas contas forem necessárias — nenhuma existente é substituída.
              </p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="bg-gold-gradient text-black shrink-0">
            <Plus size={14} className="mr-1" /> Criar nova conta
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {loading && (
            <div className="col-span-full text-center text-sm text-muted-foreground">Carregando contas…</div>
          )}
          {!loading && orderedAccounts.length === 0 && (
            <div className="col-span-full text-center text-sm text-muted-foreground">
              Nenhuma conta ainda. Clique em “Criar nova conta”.
            </div>
          )}
          {orderedAccounts.map((s, idx) => {
            const account = s.account;
            const e = edits[account] ?? { token: "", project_id: s.project_id, showToken: false };
            const validation: Validation | undefined =
              results[account] ??
              (s.last_validation_status
                ? { ok: s.last_validation_status === "VALID", status: s.last_validation_status, message: s.last_validation_detail ?? "" }
                : undefined);
            const label = s.display_name ?? LEGACY_LABEL[account] ?? account;

            return (
              <div key={account} className="space-y-3 rounded-lg border border-border/50 bg-card/40 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Instagram {idx + 1}</p>
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-[11px] text-muted-foreground">Projeto: {projectName(s.project_id)}</p>
                    <p className="text-[11px] text-muted-foreground">Business ID: {s.ig_business_id}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {validation && (
                      <div className={`flex items-center gap-1.5 text-xs font-medium ${validation.ok ? "text-emerald-500" : "text-red-500"}`}>
                        {validation.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                        {STATUS_LABEL[validation.status] ?? validation.status}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Projeto vinculado</Label>
                  <Select
                    value={e.project_id ?? "__none"}
                    onValueChange={(v) => updateEdit(account, { project_id: v === "__none" ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecionar projeto" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sem projeto</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Novo Access Token (opcional)</Label>
                  <div className="relative">
                    <Input
                      type={e.showToken ? "text" : "password"}
                      placeholder="Deixe em branco para manter o token atual"
                      value={e.token}
                      onChange={(ev) => updateEdit(account, { token: ev.target.value })}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => updateEdit(account, { showToken: !e.showToken })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label={e.showToken ? "Ocultar token" : "Mostrar token"}
                    >
                      {e.showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {validation?.message && (
                  <p className="text-[11px] text-muted-foreground">{validation.message}</p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" disabled={validatingAccount === account}
                            onClick={() => revalidate(account)}>
                      {validatingAccount === account
                        ? <Loader2 size={13} className="mr-1 animate-spin" />
                        : <RefreshCw size={13} className="mr-1" />}
                      Validar
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600"
                            onClick={() => setToDelete(s)}>
                      <Trash2 size={13} className="mr-1" /> Remover
                    </Button>
                  </div>
                  <Button size="sm" disabled={savingAccount === account}
                          onClick={() => saveAccount(account)}
                          className="bg-gold-gradient text-black">
                    {savingAccount === account
                      ? <Loader2 size={13} className="mr-1 animate-spin" />
                      : <Save size={13} className="mr-1" />}
                    Salvar
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Última atualização: {new Date(s.updated_at).toLocaleString()}
                </p>
              </div>
            );
          })}
        </div>

        {/* Dialog: nova conta */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar nova conta Instagram</DialogTitle>
              <DialogDescription>
                Adiciona uma conexão independente. Nenhuma conta existente será alterada.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome da conta</Label>
                <Input
                  placeholder="Ex.: Cinema Premium BR"
                  value={newForm.display_name}
                  onChange={(e) => setNewForm({ ...newForm, display_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Projeto vinculado</Label>
                <Select
                  value={newForm.project_id || "__none"}
                  onValueChange={(v) => setNewForm({ ...newForm, project_id: v === "__none" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecionar projeto" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem projeto</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Instagram Business Account ID</Label>
                <Input
                  placeholder="17841400000000000"
                  value={newForm.ig_business_id}
                  onChange={(e) => setNewForm({ ...newForm, ig_business_id: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Access Token</Label>
                <div className="relative">
                  <Input
                    type={newForm.showToken ? "text" : "password"}
                    placeholder="EAAG..."
                    value={newForm.access_token}
                    onChange={(e) => setNewForm({ ...newForm, access_token: e.target.value })}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setNewForm({ ...newForm, showToken: !newForm.showToken })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    {newForm.showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={createAccount} disabled={creating} className="bg-gold-gradient text-black">
                {creating ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Plus size={14} className="mr-1" />}
                Criar conta
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm delete */}
        <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover conta Instagram?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação remove apenas as credenciais desta conta ({toDelete?.display_name ?? toDelete?.account}).
                As demais contas continuam intactas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-red-500 hover:bg-red-600">
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
