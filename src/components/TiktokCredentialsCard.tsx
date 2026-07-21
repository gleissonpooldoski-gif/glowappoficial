import { useEffect, useState } from "react";
import { Music2, Loader2, CheckCircle2, XCircle, LogIn, LogOut, RefreshCw, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  TIKTOK_ACCOUNTS,
  TiktokAccount,
  TiktokCredential,
  disconnectTiktok,
  listTiktokCredentials,
  refreshTiktokToken,
  startTiktokAuth,
} from "@/lib/tiktok";

export default function TiktokCredentialsCard() {
  const [creds, setCreds] = useState<Record<TiktokAccount, TiktokCredential | undefined>>({} as any);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<TiktokAccount | null>(null);

  const load = async () => {
    setLoading(true);
    try { setCreds(await listTiktokCredentials()); }
    catch (e: any) { toast.error(e?.message ?? "Falha ao carregar contas TikTok."); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const connect = async (account: TiktokAccount) => {
    setBusy(account);
    try {
      const url = await startTiktokAuth(account);
      window.open(url, "_blank", "noopener,noreferrer");
      toast.message("Autorização aberta em nova aba", { description: "Conclua o login no TikTok e volte para ver o status." });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao iniciar OAuth.");
    } finally { setBusy(null); }
  };

  const disconnect = async (account: TiktokAccount) => {
    if (!confirm(`Desconectar TikTok da conta ${account.toUpperCase()}?`)) return;
    setBusy(account);
    try { await disconnectTiktok(account); toast.success("Conta desconectada."); await load(); }
    catch (e: any) { toast.error(e?.message); }
    finally { setBusy(null); }
  };

  const refresh = async (account: TiktokAccount) => {
    setBusy(account);
    try { await refreshTiktokToken(account); toast.success("Token renovado."); await load(); }
    catch (e: any) { toast.error(e?.message); }
    finally { setBusy(null); }
  };

  return (
    <Card className="glass border-border/50">
      <CardContent className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-gradient text-black">
            <Music2 size={18} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Configuração do TikTok</h2>
            <p className="text-xs text-muted-foreground">
              Conecte cada conta via OAuth oficial (Login Kit + Content Posting API). Os tokens ficam no backend e nunca são expostos ao navegador.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {TIKTOK_ACCOUNTS.map(({ value, label }) => {
            const c = creds[value];
            const connected = !!c?.open_id;
            const expiresSoon = c?.expires_at ? new Date(c.expires_at).getTime() - Date.now() < 24 * 3600_000 : false;

            return (
              <div key={value} className="space-y-3 rounded-lg border border-border/50 bg-card/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {connected
                        ? `Conectado${c?.username ? ` como @${c.username}` : ""}${c?.open_id ? ` · open_id ${c.open_id.slice(0, 8)}…` : ""}`
                        : "Nenhuma conta conectada."}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${connected ? "text-emerald-500" : "text-muted-foreground"}`}>
                    {connected ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    {connected ? "Conectado" : "Não conectado"}
                  </div>
                </div>

                {connected && (
                  <div className="grid gap-1 text-[11px] text-muted-foreground md:grid-cols-2">
                    <span>Access token expira: <b className={expiresSoon ? "text-amber-500" : ""}>{c?.expires_at ? new Date(c.expires_at).toLocaleString() : "—"}</b></span>
                    <span>Refresh expira: <b>{c?.refresh_expires_at ? new Date(c.refresh_expires_at).toLocaleString() : "—"}</b></span>
                    <span className="md:col-span-2">Escopos: <b>{c?.scope ?? "—"}</b></span>
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2">
                  {connected ? (
                    <>
                      <Button variant="ghost" size="sm" disabled={busy === value} onClick={() => refresh(value)}>
                        {busy === value ? <Loader2 size={13} className="mr-1 animate-spin" /> : <RefreshCw size={13} className="mr-1" />}
                        Renovar token
                      </Button>
                      <Button variant="outline" size="sm" disabled={busy === value} onClick={() => disconnect(value)}>
                        <LogOut size={13} className="mr-1" /> Desconectar
                      </Button>
                      <Button size="sm" disabled={busy === value} onClick={() => connect(value)} className="bg-gold-gradient text-black">
                        <ExternalLink size={13} className="mr-1" /> Reconectar
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" disabled={busy === value || loading} onClick={() => connect(value)} className="bg-gold-gradient text-black">
                      {busy === value ? <Loader2 size={13} className="mr-1 animate-spin" /> : <LogIn size={13} className="mr-1" />}
                      Conectar TikTok
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
