import { useEffect, useState } from "react";
import { Loader2, Upload, ExternalLink } from "lucide-react";
import { useActiveProject } from "@/context/ProjectContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { YoutubeAccount, listLibraryVideos, uploadToYoutube } from "@/lib/youtube";

type LibVideo = {
  id: string;
  filename: string | null;
  original_path: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
};

const CATEGORIES: { id: string; label: string }[] = [
  { id: "1", label: "Film & Animation" },
  { id: "10", label: "Music" },
  { id: "17", label: "Sports" },
  { id: "20", label: "Gaming" },
  { id: "22", label: "People & Blogs" },
  { id: "23", label: "Comedy" },
  { id: "24", label: "Entertainment" },
  { id: "27", label: "Education" },
  { id: "28", label: "Science & Technology" },
];

export default function YoutubeUploadDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: YoutubeAccount;
}) {
  const { activeProject } = useActiveProject();
  const [videos, setVideos] = useState<LibVideo[]>([]);
  const [videoId, setVideoId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [categoryId, setCategoryId] = useState("22");
  const [privacyStatus, setPrivacyStatus] = useState<"private" | "unlisted" | "public">("private");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ url: string | null } | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setLoading(true);
    listLibraryVideos(50, activeProject?.id ?? null)
      .then((rows) => {
        setVideos(rows as LibVideo[]);
        if (rows[0]?.id) {
          setVideoId(rows[0].id);
          if (!title) setTitle((rows[0].filename ?? "").replace(/\.[^.]+$/, ""));
        }
      })
      .catch((e) => toast.error(e?.message ?? "Falha ao carregar biblioteca."))
      .finally(() => setLoading(false));
  }, [open, activeProject?.id]);

  const submit = async () => {
    if (!videoId) return toast.error("Selecione um vídeo da biblioteca.");
    if (!title.trim()) return toast.error("Informe um título.");
    setSubmitting(true);
    setResult(null);
    try {
      const res = await uploadToYoutube({
        account,
        video_id: videoId,
        title: title.trim(),
        description,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        category_id: categoryId,
        privacy_status: privacyStatus,
      });
      setResult({ url: res.url });
      toast.success("Vídeo enviado ao YouTube!");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no upload.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar vídeo para YouTube</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Vídeo da biblioteca</Label>
            <Select value={videoId} onValueChange={(v) => {
              setVideoId(v);
              const found = videos.find((x) => x.id === v);
              if (found && !title) setTitle((found.filename ?? "").replace(/\.[^.]+$/, ""));
            }}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Carregando..." : "Selecione um vídeo"} />
              </SelectTrigger>
              <SelectContent>
                {videos.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.filename ?? v.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="space-y-1.5">
            <Label>Tags (separadas por vírgula)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="shorts, viral, tutorial" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Privacidade</Label>
              <Select value={privacyStatus} onValueChange={(v) => setPrivacyStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Privado</SelectItem>
                  <SelectItem value="unlisted">Não listado</SelectItem>
                  <SelectItem value="public">Público</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {result?.url && (
            <a href={result.url} target="_blank" rel="noreferrer"
               className="flex items-center gap-1.5 text-sm text-emerald-500 hover:underline">
              <ExternalLink size={13} /> Abrir no YouTube
            </a>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Fechar</Button>
          <Button onClick={submit} disabled={submitting || loading} className="bg-gold-gradient text-black">
            {submitting ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Upload size={13} className="mr-1" />}
            Enviar para YouTube
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
