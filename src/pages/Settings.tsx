import { useEffect, useState } from "react";
import { Instagram, Music2, KeyRound, Link2, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Account = {
  network: "instagram" | "tiktok";
  status: "connected" | "disconnected" | "expired" | string;
  account_name: string | null;
};

const NETWORKS: { key: "instagram" | "tiktok"; label: string; Icon: any }[] = [
  { key: "instagram", label: "Instagram", Icon: Instagram },
  { key: "tiktok", label: "TikTok", Icon: Music2 },
];

export default function Settings() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Record<string, Account | undefined>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("social_accounts")
        .select("network, status, account_name");
      const map: Record<string, Account> = {};
      ((data ?? []) as Account[]).forEach((a) => (map[a.network] = a));
      setAccounts(map);
    })();
  }, [user?.id]);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Contas conectadas, tokens e integrações do workspace.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Redes sociais</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {NETWORKS.map(({ key, label, Icon }) => {
            const acc = accounts[key];
            const connected = acc?.status === "connected";
            return (
              <Card key={key}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted/40">
                      <Icon size={15} />
                    </div>
                    <CardTitle className="text-sm font-medium">{label}</CardTitle>
                  </div>
                  <Badge variant={connected ? "default" : "outline"} className="capitalize">
                    {acc?.status ?? "desconectado"}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {acc?.account_name
                      ? `Conectado como @${acc.account_name}`
                      : "Conecte a API oficial para agendar e publicar automaticamente."}
                  </p>
                  <Button variant="outline" size="sm" disabled className="w-full gap-1.5">
                    <Link2 size={13} /> Conectar (em breve)
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Tokens e APIs</h2>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <KeyRound size={14} /> Access tokens
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ig-token">Instagram Access Token</Label>
              <Input id="ig-token" placeholder="Configurado via OAuth (em breve)" disabled />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tt-token">TikTok Access Token</Label>
              <Input id="tt-token" placeholder="Configurado via OAuth (em breve)" disabled />
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Shield size={12} className="mt-0.5" />
              Tokens serão gerenciados via OAuth oficial e armazenados de forma segura. A
              publicação automática estará disponível quando as APIs forem conectadas.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Conta</h2>
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="text-muted-foreground text-xs">Email</div>
            <div>{user?.email}</div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
