import { useEffect, useRef, useState } from "react";
import { Palette, Upload, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

const BUCKET = "brand-assets";

type Brand = {
  id?: string;
  logo_url: string | null;
  page_name: string;
  primary_color: string;
  secondary_color: string;
  font: string;
  watermark_enabled: boolean;
  watermark_position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
};

const DEFAULT: Brand = {
  logo_url: null,
  page_name: "",
  primary_color: "#D4AF37",
  secondary_color: "#FFFFFF",
  font: "Montserrat",
  watermark_enabled: true,
  watermark_position: "bottom-right",
};

export default function Brand() {
  const [brand, setBrand] = useState<Brand>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("brand_settings")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data) setBrand(data as Brand);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const payload = {
      logo_url: brand.logo_url,
      page_name: brand.page_name,
      primary_color: brand.primary_color,
      secondary_color: brand.secondary_color,
      font: brand.font,
      watermark_enabled: brand.watermark_enabled,
      watermark_position: brand.watermark_position,
    };
    const { data, error } = brand.id
      ? await supabase.from("brand_settings").update(payload).eq("id", brand.id).select().maybeSingle()
      : await supabase.from("brand_settings").insert(payload).select().maybeSingle();
    setSaving(false);
    if (error) return toast.error(error.message);
    if (data) setBrand(data as Brand);
    toast.success("Marca salva");
  };

  const upload = async (file: File) => {
    setUploading(true);
    const path = `logo-${Date.now()}-${file.name}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (up.error) {
      setUploading(false);
      return toast.error(up.error.message);
    }
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
    setBrand((b) => ({ ...b, logo_url: signed?.signedUrl ?? null }));
    setUploading(false);
    toast.success("Logo enviado");
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Minha Marca</h1>
        <p className="text-sm text-muted-foreground">
          Sua identidade visual é aplicada em todos os vídeos processados.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="glass border-border/50 lg:col-span-2">
          <CardContent className="space-y-5 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome da página</Label>
                <Input
                  placeholder="@minhapagina"
                  value={brand.page_name}
                  onChange={(e) => setBrand({ ...brand, page_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fonte</Label>
                <Select
                  value={brand.font}
                  onValueChange={(v) => setBrand({ ...brand, font: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Montserrat", "Poppins", "Roboto"].map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cor principal</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={brand.primary_color}
                    onChange={(e) => setBrand({ ...brand, primary_color: e.target.value })}
                    className="h-10 w-14 p-1"
                  />
                  <Input
                    value={brand.primary_color}
                    onChange={(e) => setBrand({ ...brand, primary_color: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Cor secundária</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={brand.secondary_color}
                    onChange={(e) => setBrand({ ...brand, secondary_color: e.target.value })}
                    className="h-10 w-14 p-1"
                  />
                  <Input
                    value={brand.secondary_color}
                    onChange={(e) => setBrand({ ...brand, secondary_color: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Marca d'água</Label>
                  <p className="text-xs text-muted-foreground">Aplicar logo nos vídeos gerados.</p>
                </div>
                <Switch
                  checked={brand.watermark_enabled}
                  onCheckedChange={(v) => setBrand({ ...brand, watermark_enabled: v })}
                />
              </div>
              {brand.watermark_enabled && (
                <div className="mt-4 space-y-1.5">
                  <Label>Posição</Label>
                  <Select
                    value={brand.watermark_position}
                    onValueChange={(v: any) => setBrand({ ...brand, watermark_position: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="top-left">Superior esquerda</SelectItem>
                      <SelectItem value="top-right">Superior direita</SelectItem>
                      <SelectItem value="bottom-left">Inferior esquerda</SelectItem>
                      <SelectItem value="bottom-right">Inferior direita</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving} className="bg-gold-gradient text-black">
                <Save size={14} className="mr-1" /> {saving ? "Salvando..." : "Salvar marca"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-border/50">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <Palette size={16} className="text-gold" />
              <h3 className="text-sm font-medium">Logo</h3>
            </div>
            <div
              className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border/60 bg-black/40"
            >
              {brand.logo_url ? (
                <img src={brand.logo_url} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <div className="text-center text-xs text-muted-foreground">
                  PNG recomendado<br />(transparente)
                </div>
              )}
            </div>
            <Button
              variant="outline"
              className="w-full border-border/60"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Upload size={14} className="mr-1" />
              {uploading ? "Enviando..." : "Enviar logo"}
            </Button>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              ref={fileRef}
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />

            <div className="rounded-lg border border-border/50 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Preview</p>
              <div
                className="mt-2 aspect-[9/16] rounded-md p-3"
                style={{ background: `linear-gradient(135deg,${brand.primary_color}22,#050505)` }}
              >
                <div className="text-xs" style={{ color: brand.secondary_color, fontFamily: brand.font }}>
                  {brand.page_name || "@suapagina"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
