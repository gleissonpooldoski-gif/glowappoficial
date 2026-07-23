import { useEffect, useState } from "react";
import { Youtube, Loader2, CheckCircle2, XCircle, LogIn, LogOut, RefreshCw, ExternalLink, Upload, Plus, Link2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  YoutubeAccount,
  YoutubeCredential,
  disconnectYoutube,
  listYoutubeChannels,
  refreshYoutubeToken,
  startYoutubeAuth,
  setYoutubeChannelProject,
} from "@/lib/youtube";
import YoutubeUploadDialog from "./YoutubeUploadDialog";

type ProjectRow = { id: string; name: string };

export default function YoutubeCredentialsCard() {
  const [channels, setChannels] = useState<YoutubeCredential[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<YoutubeAccount | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [ch, pr] = await Promise.all([
        listYoutubeChannels(),
        supabase.from("projects").select("id, name").order("name"),
      ]);
      setChannels(ch);
      setProjects(((pr.data as any[]) ?? []) as ProjectRow[]);
    }
    catch (e: any) { toast.error(e?.message ?? "Falha ao carregar canais do YouTube."); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const updateProject = async (account: string, projectId: string | null) => {
    setBusy(account);
    try {
      await setYoutubeChannelProject(account, projectId);
      toast.success(projectId ? "Projeto vinculado ao canal." : "Vínculo removido.");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao vincular projeto.");
    } finally { setBusy(null); }
  };

  const connectNew = async () => {
    setBusy("__new__");
    try {
      // Chave temporária "new-<rand>"; o callback grava sob o channel_id real.
      const slug = `new-${Math.random().toString(36).slice(2, 10)}`;
      const url = await startYoutubeAuth(slug);
      window.open(url, "_blank", "noopener,noreferrer");
      toast.message("Autorização aberta em nova aba", {
        description: "Escolha a conta Google do canal que deseja conectar e volte para ver o status.",
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao iniciar OAuth.");
    } finally { setBusy(null); }
  };

  const reconnect = async (account: string) => {
    setBusy(account);
    try {
      const url = await startYoutubeAuth(account);
      window.open(url, "_blank", "noopener,noreferrer");
      toast.message("Autorização aberta em nova aba");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao iniciar OAuth.");
    } finally { setBusy(null); }
  };

  const disconnect = async (c: YoutubeCredential) => {
    const name = c.channel_title ?? c.label ?? c.account;
    if (!confirm(`Tem certeza que deseja desconectar este canal do YouTube?\n\n"${name}" — os outros canais permanecerão conectados.`)) return;
    setBusy(c.account);
    try { await disconnectYoutube(c.account); toast.success("Canal desconectado com sucesso."); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Falha ao desconectar canal."); }
    finally { setBusy(null); }
  };

  const refresh = async (account: string) => {
    setBusy(account);
    try { await refreshYoutubeToken(account); toast.success("Token renovado."); await load(); }
    catch (e: any) { toast.error(e?.message); }
    finally { setBusy(null); }
  };

  return (
    <Card className="glass border-border/50">
      <CardContent className="space-y-6 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-gradient text-black">
              <Youtube size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Canais do YouTube</h2>
              <p className="text-xs text-muted-foreground">
                Conecte múltiplos canais via OAuth oficial do Google. Cada canal fica disponível para publicação individual.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="bg-gold-gradient text-black"
            disabled={busy === "__new__"}
            onClick={connectNew}
          >
            {busy === "__new__" ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Plus size={13} className="mr-1" />}
            Conectar outro canal
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={13} className="animate-spin" /> Carregando canais…
          </div>
        ) : channels.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-card/30 p-6 text-center">
            <XCircle size={20} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm">Nenhum canal conectado.</p>
            <p className="text-[11px] text-muted-foreground mb-3">Conecte seu primeiro canal para começar.</p>
            <Button size="sm" className="bg-gold-gradient text-black" onClick={connectNew}>
              <LogIn size={13} className="mr-1" /> Conectar YouTube
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((c) => {
              const connected = !!c.channel_id;
              const expiresSoon = c.expires_at ? new Date(c.expires_at).getTime() - Date.now() < 24 * 3600_000 : false;
              const isBusy = busy === c.account;
              const name = c.channel_title ?? c.label ?? c.account;
              return (
                <div key={c.account} className="space-y-3 rounded-lg border border-border/50 bg-card/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      {c.thumbnail ? (
                        <img src={c.thumbnail} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <Youtube size={14} className="text-red-400" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium">▶️ {name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {connected
                            ? `Canal conectado${c.channel_id ? ` · ${c.channel_id.slice(0, 14)}…` : ""}`
                            : "Sem informações do canal."}
                        </p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs font-medium ${connected ? "text-emerald-500" : "text-muted-foreground"}`}>
                      {connected ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      {connected ? "Conectado" : "Não conectado"}
                    </div>
                  </div>

                  {connected && (
                    <div className="grid gap-1 text-[11px] text-muted-foreground md:grid-cols-2">
                      <span>Access token expira: <b className={expiresSoon ? "text-amber-500" : ""}>{c.expires_at ? new Date(c.expires_at).toLocaleString() : "—"}</b></span>
                      <span>Última validação: <b>{c.last_validated_at ? new Date(c.last_validated_at).toLocaleString() : "—"}</b></span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 rounded-md border border-border/40 bg-background/30 px-3 py-2">
                    <Link2 size={13} className="text-gold shrink-0" />
                    <Label className="text-[11px] text-muted-foreground shrink-0">Projeto vinculado</Label>
                    <Select
                      value={c.project_id ?? "__none__"}
                      onValueChange={(v) => updateProject(c.account, v === "__none__" ? null : v)}
                      disabled={isBusy}
                    >
                      <SelectTrigger className="h-8 flex-1 text-xs">
                        <SelectValue placeholder="Nenhum projeto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Nenhum projeto —</SelectItem>
                        {projects.map((p) => {
                          const takenBy = channels.find((x) => x.project_id === p.id && x.account !== c.account);
                          return (
                            <SelectItem key={p.id} value={p.id} disabled={!!takenBy}>
                              {p.name}{takenBy ? ` (usado por ${takenBy.channel_title ?? takenBy.account})` : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>


                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => refresh(c.account)}>
                      {isBusy ? <Loader2 size={13} className="mr-1 animate-spin" /> : <RefreshCw size={13} className="mr-1" />}
                      Renovar
                    </Button>
                    <Button variant="outline" size="sm" disabled={isBusy} onClick={() => disconnect(c)}>
                      <LogOut size={13} className="mr-1" /> Desconectar
                    </Button>
                    {connected && (
                      <Button variant="outline" size="sm" onClick={() => setUploadFor(c.account)}>
                        <Upload size={13} className="mr-1" /> Enviar vídeo
                      </Button>
                    )}
                    <Button size="sm" disabled={isBusy} onClick={() => reconnect(c.account)} className="bg-gold-gradient text-black">
                      <ExternalLink size={13} className="mr-1" /> Reconectar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      <YoutubeUploadDialog
        open={!!uploadFor}
        onOpenChange={(v) => !v && setUploadFor(null)}
        account={uploadFor ?? ""}
      />
    </Card>
  );
}
