import { useEffect, useState } from "react";
import { Instagram, Save, Eye, EyeOff, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Account = "resenha" | "frame";

const ACCOUNTS: { key: Account; label: string }[] = [
  { key: "resenha", label: "Sessão da Resenha" },
  { key: "frame", label: "Sessão da Frame" },
];

type Validation = {
  ok: boolean;
  status: string;
  message: string;
  username?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  VALID: "✅ Token válido",
  TOKEN_INVALID: "❌ Token inválido",
  TOKEN_EXPIRED: "❌ Token expirado",
  IG_ID_INVALID: "❌ Instagram Business ID inválido",
  PERMISSION_MISSING: "❌ Permissão insuficiente",
  EMPTY: "— Campos vazios",
  UNKNOWN_ERROR: "❌ Erro ao validar",
};

type FormState = Record<Account, { access_token: string; ig_business_id: string; show: boolean }>;

const EMPTY_FORM: FormState = {
  resenha: { access_token: "", ig_business_id: "", show: false },
  frame: { access_token: "", ig_business_id: "", show: false },
};

export default function InstagramCredentialsCard() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [stored, setStored] = useState<Record<string, any>>({});
  const [results, setResults] = useState<Record<string, Validation>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [validatingAccount, setValidatingAccount] = useState<Account | null>(null);

  const loadStored = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("instagram-credentials", { body: { action: "get" } });
    setLoading(false);
    if (error) return toast.error(error.message);
    setStored(data?.credentials ?? {});
    // Pré-preenche apenas o IG ID (nunca o token)
    setForm((prev) => ({
      resenha: { ...prev.resenha, ig_business_id: data?.credentials?.resenha?.ig_business_id ?? "" },
      frame: { ...prev.frame, ig_business_id: data?.credentials?.frame?.ig_business_id ?? "" },
    }));
  };

  useEffect(() => { loadStored(); }, []);

  const update = (acc: Account, patch: Partial<FormState[Account]>) =>
    setForm((s) => ({ ...s, [acc]: { ...s[acc], ...patch } }));

  const save = async () => {
    const accounts = ACCOUNTS
      .map(({ key }) => ({
        account: key,
        access_token: form[key].access_token.trim(),
        ig_business_id: form[key].ig_business_id.trim(),
      }))
      .filter((a) => a.access_token || a.ig_business_id);

    if (accounts.length === 0) {
      toast.error("Informe pelo menos um Access Token e Business ID.");
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.functions.invoke("instagram-credentials", {
      body: { action: "save", accounts },
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setResults(data?.results ?? {});
    toast.success("Credenciais salvas. Veja o resultado da validação abaixo.");
    // Limpa os tokens do formulário; mantém IDs
    setForm((prev) => ({
      resenha: { ...prev.resenha, access_token: "" },
      frame: { ...prev.frame, access_token: "" },
    }));
    loadStored();
  };

  const revalidate = async (account: Account) => {
    setValidatingAccount(account);
    const { data, error } = await supabase.functions.invoke("instagram-credentials", {
      body: { action: "validate", account },
    });
    setValidatingAccount(null);
    if (error) return toast.error(error.message);
    setResults((prev) => ({ ...prev, [account]: data?.result }));
    loadStored();
  };

  return (
    <Card className="glass border-border/50">
      <CardContent className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-gradient text-black">
            <Instagram size={18} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Configuração da Instagram Graph API</h2>
            <p className="text-xs text-muted-foreground">
              Atualize manualmente os Access Tokens e Business IDs de cada conta. As credenciais são
              armazenadas no backend e nunca expostas no navegador.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {ACCOUNTS.map(({ key, label }) => {
            const s = form[key];
            const storedInfo = stored[key];
            const validation: Validation | undefined = results[key] ?? (storedInfo?.last_validation_status
              ? { ok: storedInfo.last_validation_status === "VALID", status: storedInfo.last_validation_status, message: storedInfo.last_validation_detail ?? "" }
              : undefined);
            return (
              <div key={key} className="space-y-3 rounded-lg border border-border/50 bg-card/40 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {storedInfo
                        ? `Última atualização: ${new Date(storedInfo.updated_at).toLocaleString()}`
                        : "Nenhuma credencial salva no banco (usando fallback dos Secrets, se houver)."}
                    </p>
                  </div>
                  {validation && (
                    <div className={`flex items-center gap-1.5 text-xs font-medium ${validation.ok ? "text-emerald-500" : "text-red-500"}`}>
                      {validation.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      {STATUS_LABEL[validation.status] ?? validation.status}
                    </div>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Access Token</Label>
                    <div className="relative">
                      <Input
                        type={s.show ? "text" : "password"}
                        placeholder={storedInfo ? "•••••• (deixe em branco para manter)" : "EAAG..."}
                        value={s.access_token}
                        onChange={(e) => update(key, { access_token: e.target.value })}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => update(key, { show: !s.show })}
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
                      onChange={(e) => update(key, { ig_business_id: e.target.value })}
                    />
                  </div>
                </div>

                {validation?.message && (
                  <p className="text-[11px] text-muted-foreground">{validation.message}</p>
                )}

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={validatingAccount === key || loading}
                    onClick={() => revalidate(key)}
                  >
                    {validatingAccount === key
                      ? <Loader2 size={13} className="mr-1 animate-spin" />
                      : <RefreshCw size={13} className="mr-1" />}
                    Validar agora
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="bg-gold-gradient text-black">
            {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
            {saving ? "Salvando..." : "Salvar e validar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
