import { useEffect, useState } from "react";
import { Save, HardDrive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import InstagramCredentialsCard from "@/components/InstagramCredentialsCard";
import PublishSchedulesCard from "@/components/PublishSchedulesCard";

type App = {
  id?: string;
  storage_location: string;
  default_quality: string;
  default_format: string;
  auto_cleanup: boolean;
};

const DEFAULT: App = {
  storage_location: "supabase",
  default_quality: "1080p",
  default_format: "9:16",
  auto_cleanup: false,
};

export default function Settings() {
  const [app, setApp] = useState<App>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data) setApp(data as App);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const payload = {
      storage_location: app.storage_location,
      default_quality: app.default_quality,
      default_format: app.default_format,
      auto_cleanup: app.auto_cleanup,
    };
    const { data, error } = app.id
      ? await supabase.from("app_settings").update(payload).eq("id", app.id).select().maybeSingle()
      : await supabase.from("app_settings").insert(payload).select().maybeSingle();
    setSaving(false);
    if (error) return toast.error(error.message);
    if (data) setApp(data as App);
    toast.success("Configurações salvas");
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Preferências gerais do estúdio.</p>
      </header>

      <Card className="glass border-border/50">
        <CardContent className="space-y-5 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Local de armazenamento</Label>
              <Select
                value={app.storage_location}
                onValueChange={(v) => setApp({ ...app, storage_location: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supabase">Supabase Storage</SelectItem>
                  <SelectItem value="local">Local (em breve)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Qualidade padrão</Label>
              <Select
                value={app.default_quality}
                onValueChange={(v) => setApp({ ...app, default_quality: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">720p</SelectItem>
                  <SelectItem value="1080p">1080p</SelectItem>
                  <SelectItem value="4k">4K</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Formato padrão</Label>
              <Select
                value={app.default_format}
                onValueChange={(v) => setApp({ ...app, default_format: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="9:16">Vertical 9:16</SelectItem>
                  <SelectItem value="1:1">Quadrado 1:1</SelectItem>
                  <SelectItem value="16:9">Horizontal 16:9</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <div>
                <Label>Limpeza automática</Label>
                <p className="text-xs text-muted-foreground">Remover originais após render.</p>
              </div>
              <Switch
                checked={app.auto_cleanup}
                onCheckedChange={(v) => setApp({ ...app, auto_cleanup: v })}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving} className="bg-gold-gradient text-black">
              <Save size={14} className="mr-1" /> {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <InstagramCredentialsCard />

      <PublishSchedulesCard />

      <Card className="glass border-border/50">
        <CardContent className="flex items-start gap-3 p-5 text-xs text-muted-foreground">
          <HardDrive size={16} className="mt-0.5 text-gold" />
          <div>
            <p className="font-medium text-foreground">Sobre o ViralFactory Studio</p>
            <p className="mt-1">
              Ferramenta pessoal de produção em massa de vídeos verticais. Sem publicação
              automática, sem usuários, sem cobrança. Arquitetura pronta para FFmpeg,
              Whisper AI e APIs de processamento.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
