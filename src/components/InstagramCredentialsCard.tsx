import { useEffect, useState } from "react";
import { Instagram, Save, Eye, EyeOff, CheckCircle2, XCircle, Loader2, RefreshCw, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { addInstagramAccount, deleteInstagramAccount, fetchInstagramAccounts } from "@/lib/instagram";

type StoredAccount = {
  account: string;
  display_name: string;
  project_id: string | null;
  ig_business_id?: string | null;
  last_validation_status?: string | null;
  last_validation_detail?: string | null;
  last_validated_at?: string | null;
  updated_at?: string | null;
};

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

type FormRow = { access_token: string; ig_business_id: string; show: boolean; project_id: string };

export default function InstagramCredentialsCard() {
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState<Record<string, FormRow>>({});
  const [results, setResults] = useState<Record<string, Validation>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [validatingAccount, setValidatingAccount] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoredAccount | null>(null);

  // Formulário de adição
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIgId, setNewIgId] = useState("");
  const [newToken, setNewToken] = useState("");
  const [newProject, setNewProject] = useState<string>("__none__");
  const [newShow, setNewShow] = useState(false);
  const [adding, setAdding] = useState(false);

  const loadStored = async () => {
    setLoading(true);
    try {
      const list = await fetchInstagramAccounts();
      setAccounts(list as StoredAccount[]);
      setForm((prev) => {
        const next: Record<string, FormRow> = {};
        for (const a of list) {
          next[a.account] = {
            access_token: "",
            ig_business_id: a.ig_business_id ?? "",
            show: prev[a.account]?.show ?? false,
            project_id: a.project_id ?? "__none__",
          };
        }
        return next;
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao carregar contas.");
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    const { data } = await supabase.from("projects").select("id,name").order("name");
    setProjects((data ?? []) as any);
  };

  useEffect(() => { loadStored(); loadProjects(); }, []);

  const update = (acc: string, patch: Partial<FormRow>) =>
    setForm((s) => ({ ...s, [acc]: { ...s[acc], ...patch } }));

  const saveOne = async (acc: StoredAccount) => {
    const row = form[acc.account];
    if (!row) return;
    setSaving(true);
    const payload: any = {
      account: acc.account,
      display_name: acc.display_name,
      project_id: row.project_id === "__none__" ? null : row.project_id,
    };
    if (row.access_token.trim()) payload.access_token = row.access_token.trim();
    if (row.ig_business_id.trim()) payload.ig_business_id = row.ig_business_id.trim();

    const { data, error } = await supabase.functions.invoke("instagram-credentials", {
      body: { action: "save", accounts: [payload] },
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setResults((prev) => ({ ...prev, ...(data?.results ?? {}) }));
    update(acc.account, { access_token: "" });
    toast.success(`Conta "${acc.display_name}" atualizada.`);
    loadStored();
  };

  const revalidate = async (account: string) => {
    setValidatingAccount(account);
    const { data, error } = await supabase.functions.invoke("instagram-credentials", {
      body: { action: "validate", account },
    });
    setValidatingAccount(null);
    if (error) return toast.error(error.message);
    setResults((prev) => ({ ...prev, [account]: data?.result }));
    loadStored();
  };

  const addAccount = async () => {
    if (!newName.trim()) return toast.error("Informe o nome da conta.");
    if (!newIgId.trim() || !newToken.trim()) return toast.error("Business ID e Access Token são obrigatórios.");
    setAdding(true);
    try {
      await addInstagramAccount({
        display_name: newName.trim(),
        ig_business_id: newIgId.trim(),
        access_token: newToken.trim(),
        project_id: newProject === "__none__" ? null : newProject,
      });
      toast.success(`Conta "${newName.trim()}" adicionada.`);
      setNewName(""); setNewIgId(""); setNewToken(""); setNewProject("__none__"); setNewShow(false);
      setAddOpen(false);
      loadStored();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao adicionar conta.");
    } finally {
      setAdding(false);
    }
  };

  const removeAccount = async () => {
    if (!deleteTarget) return;
    try {
      await deleteInstagramAccount(deleteTarget.account);
      toast.success(`Conta "${deleteTarget.display_name}" removida.`);
      setDeleteTarget(null);
      loadStored();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao remover.");
    }
  };

  return (
    <Card className="glass border-border/50">
      <CardContent className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-gradient text-black">
              <Instagram size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Configuração da Instagram Graph API</h2>
              <p className="text-xs text-muted-foreground">
                Adicione múltiplas contas do Instagram. Cada conta pode ser vinculada a um projeto
                e possui sua própria grade de horários, legendas e fila de agendamento.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddOpen((v) => !v)}
            className="shrink-0 gap-1.5"
          >
            <Plus size={14} /> {addOpen ? "Cancelar" : "Adicionar nova conta Instagram"}
          </Button>
        </div>

        {addOpen && (
          <div className="space-y-3 rounded-lg border border-gold/40 bg-gold/5 p-4">
            <p className="text-sm font-medium text-gold">Nova conta do Instagram</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome da conta/projeto</Label>
                <Input placeholder="Ex.: Minha Marca" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Projeto vinculado (opcional)</Label>
                <Select value={newProject} onValueChange={setNewProject}>
                  <SelectTrigger><SelectValue placeholder="Sem vínculo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem vínculo</SelectItem>
                    {projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Instagram Business Account ID</Label>
                <Input placeholder="17841400000000000" value={newIgId} onChange={(e) => setNewIgId(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Access Token</Label>
                <div className="relative">
                  <Input
                    type={newShow ? "text" : "password"}
                    placeholder="EAAG..."
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setNewShow((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label={newShow ? "Ocultar token" : "Mostrar token"}
                  >
                    {newShow ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={addAccount} disabled={adding} className="bg-gold-gradient text-black gap-1.5">
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {adding ? "Validando e salvando..." : "Conectar conta"}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto animate-spin text-gold" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
            Nenhuma conta do Instagram conectada ainda.
            <br />Clique em <b>“Adicionar nova conta Instagram”</b> para começar.
          </div>
        ) : (
          <div className="space-y-6">
            {accounts.map((acc) => {
              const s = form[acc.account] ?? { access_token: "", ig_business_id: "", show: false, project_id: "__none__" };
              const validation: Validation | undefined = results[acc.account] ?? (acc.last_validation_status
                ? { ok: acc.last_validation_status === "VALID", status: acc.last_validation_status, message: acc.last_validation_detail ?? "" }
                : undefined);
              const linkedProject = projects.find((p) => p.id === acc.project_id);
              return (
                <div key={acc.account} className="space-y-3 rounded-lg border border-border/50 bg-card/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        ✅ {acc.display_name}
                        <span className="ml-2 text-[10px] font-mono text-muted-foreground">({acc.account})</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {acc.updated_at
                          ? `Última sincronização: ${new Date(acc.updated_at).toLocaleString()}`
                          : "Nunca sincronizada."}
                      </p>
                      {linkedProject && (
                        <p className="text-[11px] text-muted-foreground">
                          Projeto vinculado: <b className="text-foreground">{linkedProject.name}</b>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {validation && (
                        <div className={`flex items-center gap-1.5 text-xs font-medium ${validation.ok ? "text-emerald-500" : "text-red-500"}`}>
                          {validation.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                          {STATUS_LABEL[validation.status] ?? validation.status}
                        </div>
                      )}
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(acc)}
                        aria-label="Remover conta"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Access Token (deixe vazio p/ manter)</Label>
                      <div className="relative">
                        <Input
                          type={s.show ? "text" : "password"}
                          placeholder="•••••• (manter atual)"
                          value={s.access_token}
                          onChange={(e) => update(acc.account, { access_token: e.target.value })}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => update(acc.account, { show: !s.show })}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                          aria-label={s.show ? "Ocultar token" : "Mostrar token"}
                        >
                          {s.show ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Instagram Business Account ID</Label>
                      <Input
                        placeholder="17841400000000000"
                        value={s.ig_business_id}
                        onChange={(e) => update(acc.account, { ig_business_id: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label className="text-xs">Projeto vinculado</Label>
                      <Select value={s.project_id} onValueChange={(v) => update(acc.account, { project_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Sem vínculo" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sem vínculo</SelectItem>
                          {projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {validation?.message && (
                    <p className="text-[11px] text-muted-foreground">{validation.message}</p>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost" size="sm"
                      disabled={validatingAccount === acc.account}
                      onClick={() => revalidate(acc.account)}
                    >
                      {validatingAccount === acc.account
                        ? <Loader2 size={13} className="mr-1 animate-spin" />
                        : <RefreshCw size={13} className="mr-1" />}
                      Validar agora
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => saveOne(acc)}
                      disabled={saving}
                      className="bg-gold-gradient text-black"
                    >
                      {saving ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Save size={13} className="mr-1" />}
                      Salvar alterações
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover conta do Instagram?</AlertDialogTitle>
              <AlertDialogDescription>
                A conta <b>{deleteTarget?.display_name}</b> será desconectada. Os posts já publicados
                permanecem no histórico, mas novos agendamentos ficarão indisponíveis para essa conta.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={removeAccount} className="bg-destructive text-destructive-foreground">
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
