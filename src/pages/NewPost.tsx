import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Instagram, Upload, Image as ImageIcon, Check } from "lucide-react";
import { TiktokIcon } from "@/components/NetworkIcon";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";

interface Media {
  id: string;
  name: string;
  type: "image" | "video";
  storage_path: string;
  url?: string;
}

export default function NewPost() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [instagram, setInstagram] = useState(false);
  const [tiktok, setTiktok] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<Media[]>([]);
  const [library, setLibrary] = useState<Media[]>([]);
  const [libOpen, setLibOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("media").select("*").order("created_at", { ascending: false });
      const withUrls = await Promise.all(
        (data ?? []).map(async (m: any) => {
          const { data: signed } = await supabase.storage.from("media").createSignedUrl(m.storage_path, 3600);
          return { ...m, url: signed?.signedUrl };
        })
      );
      setLibrary(withUrls);

      if (id) {
        const { data: p } = await supabase.from("posts").select("*").eq("id", id).maybeSingle();
        if (p) {
          setCaption(p.caption ?? "");
          setHashtags(p.hashtags ?? "");
          setInstagram((p.networks as string[]).includes("instagram"));
          setTiktok((p.networks as string[]).includes("tiktok"));
          const sel = withUrls.filter((m) => (p.media_ids as string[]).includes(m.id));
          setSelectedMedia(sel);
        }
      }
    })();
  }, [user, id]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || !user) return;
    for (const file of Array.from(files)) {
      const type: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
      const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, file);
      if (upErr) {
        toast.error(upErr.message);
        continue;
      }
      const { data: inserted, error: dbErr } = await supabase
        .from("media")
        .insert({
          user_id: user.id,
          name: file.name,
          type,
          storage_path: path,
          mime_type: file.type,
          size_bytes: file.size,
        })
        .select()
        .single();
      if (dbErr || !inserted) {
        toast.error(dbErr?.message ?? "Erro no upload");
        continue;
      }
      const { data: signed } = await supabase.storage.from("media").createSignedUrl(path, 3600);
      const media: Media = { ...(inserted as any), url: signed?.signedUrl };
      setSelectedMedia((prev) => [...prev, media]);
      setLibrary((prev) => [media, ...prev]);
    }
    toast.success("Mídia adicionada");
  };

  const toggleFromLibrary = (m: Media) => {
    setSelectedMedia((prev) =>
      prev.find((x) => x.id === m.id) ? prev.filter((x) => x.id !== m.id) : [...prev, m]
    );
  };

  const buildNetworks = () => {
    const n: string[] = [];
    if (instagram) n.push("instagram");
    if (tiktok) n.push("tiktok");
    return n;
  };

  const savePost = async (schedule: boolean) => {
    if (!user) return;
    const networks = buildNetworks();
    if (schedule && networks.length === 0) return toast.error("Selecione ao menos uma rede");
    if (schedule && (!date || !time)) return toast.error("Informe data e hora");

    setSaving(true);
    const payload = {
      user_id: user.id,
      caption,
      hashtags,
      media_ids: selectedMedia.map((m) => m.id),
      networks: networks as any,
      status: (schedule ? "scheduled" : "draft") as any,
    };

    let postId = id;
    if (id) {
      const { error } = await supabase.from("posts").update(payload).eq("id", id);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase.from("posts").insert(payload).select().single();
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      postId = data.id;
    }

    if (schedule && postId) {
      const scheduledAt = new Date(`${date}T${time}`).toISOString();
      await supabase.from("scheduled_posts").insert({
        user_id: user.id,
        post_id: postId,
        scheduled_at: scheduledAt,
        networks: networks as any,
        status: "scheduled",
      });
      toast.success("Post agendado");
    } else {
      toast.success("Rascunho salvo");
    }
    setSaving(false);
    navigate(schedule ? "/calendar" : "/");
  };

  const preview = selectedMedia[0];

  return (
    <div>
      <PageHeader title={id ? "Editar Post" : "Novo Post"} description="Crie e agende conteúdo" />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Media */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Mídias</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Dialog open={libOpen} onOpenChange={setLibOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline"><ImageIcon size={14} className="mr-1.5" />Da biblioteca</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <DialogHeader><DialogTitle>Selecionar mídias</DialogTitle></DialogHeader>
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2 max-h-[60vh] overflow-auto">
                      {library.map((m) => {
                        const sel = selectedMedia.some((x) => x.id === m.id);
                        return (
                          <button
                            key={m.id}
                            onClick={() => toggleFromLibrary(m)}
                            className={`relative aspect-square rounded-md overflow-hidden border-2 ${sel ? "border-primary" : "border-transparent"}`}
                          >
                            {m.type === "image" && m.url ? (
                              <img src={m.url} className="h-full w-full object-cover" />
                            ) : (
                              <video src={m.url} className="h-full w-full object-cover" muted />
                            )}
                            {sel && (
                              <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                <Check size={12} />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => setLibOpen(false)}>Concluir</Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <input ref={fileInput} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => handleUpload(e.target.files)} />
                <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                  <Upload size={14} className="mr-1.5" />Upload
                </Button>
              </div>

              {selectedMedia.length > 0 && (
                <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                  {selectedMedia.map((m) => (
                    <div key={m.id} className="aspect-square rounded-md overflow-hidden bg-secondary relative group">
                      {m.type === "image" && m.url ? (
                        <img src={m.url} className="h-full w-full object-cover" />
                      ) : (
                        <video src={m.url} className="h-full w-full object-cover" muted />
                      )}
                      <button
                        onClick={() => setSelectedMedia((p) => p.filter((x) => x.id !== m.id))}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 text-white text-xs flex items-center justify-center transition-opacity"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Text */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Conteúdo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Legenda</Label>
                <Textarea rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Escreva sua legenda..." />
              </div>
              <div className="space-y-2">
                <Label>Hashtags</Label>
                <Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#exemplo #conteudo" />
              </div>
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Agendamento</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Hora</Label>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Redes sociais</Label>
                <div className="flex flex-col gap-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <Checkbox checked={instagram} onCheckedChange={(v) => setInstagram(!!v)} />
                    <Instagram size={16} className="text-instagram" />
                    <span className="text-sm">Instagram</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <Checkbox checked={tiktok} onCheckedChange={(v) => setTiktok(!!v)} />
                    <TiktokIcon className="h-4 w-4 text-tiktok" />
                    <span className="text-sm">TikTok</span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => savePost(false)} disabled={saving}>Salvar rascunho</Button>
            <Button onClick={() => savePost(true)} disabled={saving}>Agendar publicação</Button>
          </div>
        </div>

        {/* Preview */}
        <div>
          <Card className="sticky top-4">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Preview</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <div className="aspect-square bg-secondary flex items-center justify-center">
                  {preview?.type === "image" && preview.url ? (
                    <img src={preview.url} className="h-full w-full object-cover" />
                  ) : preview?.type === "video" && preview.url ? (
                    <video src={preview.url} className="h-full w-full object-cover" controls muted />
                  ) : (
                    <ImageIcon size={32} className="text-muted-foreground/40" />
                  )}
                </div>
                <div className="p-3 space-y-2">
                  <p className="text-xs whitespace-pre-wrap">{caption || <span className="text-muted-foreground">Legenda aparecerá aqui...</span>}</p>
                  {hashtags && <p className="text-xs text-primary">{hashtags}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
