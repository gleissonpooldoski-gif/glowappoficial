import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Instagram, CheckCircle2, XCircle } from "lucide-react";
import { TiktokIcon } from "@/components/NetworkIcon";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface Account {
  network: "instagram" | "tiktok";
  status: "connected" | "disconnected" | "error";
  account_name: string | null;
}

export default function Settings() {
  const { user, signOut } = useAuth();
  const [accounts, setAccounts] = useState<Record<string, Account>>({});

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("social_accounts").select("network, status, account_name");
    const map: Record<string, Account> = {};
    (data ?? []).forEach((a: any) => { map[a.network] = a; });
    setAccounts(map);
  };

  useEffect(() => { load(); }, [user]);

  const connect = async (network: "instagram" | "tiktok") => {
    if (!user) return;
    toast.info("Integração oficial será adicionada em breve. Estrutura preparada.");
    // Placeholder: create a disconnected record to reserve the slot
    await supabase.from("social_accounts").upsert({
      user_id: user.id,
      network,
      status: "disconnected",
    }, { onConflict: "user_id,network" });
    load();
  };

  const services = [
    { network: "instagram" as const, name: "Instagram", icon: Instagram, color: "text-instagram", description: "API oficial do Instagram Graph" },
    { network: "tiktok" as const, name: "TikTok", icon: TiktokIcon, color: "text-tiktok", description: "TikTok Content Posting API" },
  ];

  return (
    <div>
      <PageHeader title="Configurações" description="Contas conectadas e preferências" />

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium mb-3">Contas conectadas</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {services.map((s) => {
              const Icon = s.icon;
              const a = accounts[s.network];
              const connected = a?.status === "connected";
              return (
                <Card key={s.network}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-5 w-5 ${s.color}`} />
                        <CardTitle className="text-base">{s.name}</CardTitle>
                      </div>
                      {connected ? (
                        <Badge className="bg-success text-success-foreground hover:bg-success/90"><CheckCircle2 size={12} className="mr-1" />Conectado</Badge>
                      ) : (
                        <Badge variant="secondary"><XCircle size={12} className="mr-1" />Desconectado</Badge>
                      )}
                    </div>
                    <CardDescription className="text-xs">{s.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button size="sm" variant={connected ? "outline" : "default"} className="w-full" onClick={() => connect(s.network)}>
                      {connected ? "Reconectar" : "Conectar"}
                    </Button>
                    <p className="text-[10px] text-muted-foreground mt-2 text-center">Integração oficial em preparação</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conta</CardTitle>
            <CardDescription>{user?.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={signOut}>Sair da conta</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
