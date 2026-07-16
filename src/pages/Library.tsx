import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Upload, Search, Trash2, Film, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

type MediaRow = {
  id: string;
  name: string;
  type: "image" | "video";
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

type MediaItem = MediaRow & { url: string };

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function Library() {
  const { user } = useAuth();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [toDelete, setToDelete] = useState<MediaItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("media")
      .select("id,name,type,storage_path,mime_type,size_bytes,created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as MediaRow[];
    const withUrls = await Promise.all(
      rows.map(async (r) => {
        const { data: signed } = await supabase.storage
          .from("media")
          .createSignedUrl(r.storage_path, 60 * 60);
        return { ...r, url: signed?.signedUrl ?? "" };
      })
    );
    setItems(withUrls);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !user) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");
        if (!isImage && !isVideo) {
          toast.error(`Ignorado: ${file.name} (apenas imagem ou vídeo)`);
          continue;
        }
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("media")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { error: dbErr } = await supabase.from("media").insert({
          user_id: user.id,
          name: file.name,
          type: isImage ? "image" : "video",
          storage_path: path,
          mime_type: file.type,
          size_bytes: file.size,
        });
        if (dbErr) {
          await supabase.storage.from("media").remove([path]);
          throw dbErr;
        }
      }
      toast.success("Upload concluído");
      await load();
    } catch (err: any) {
      toast.error(err.message ?? "Falha no upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const item = toDelete;
    setToDelete(null);
    const { error: sErr } = await supabase.storage.from("media").remove([item.storage_path]);
    if (sErr) {
      toast.error(sErr.message);
      return;
    }
    const { error: dErr } = await supabase.from("media").delete().eq("id", item.id);
    if (dErr) {
      toast.error(dErr.message);
      return;
    }
    toast.success("Arquivo excluído");
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Biblioteca</h1>
          <p className="text-sm text-muted-foreground">
            Organize suas mídias, imagens e vídeos em um único lugar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Pesquisar..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-56 pl-8"
            />
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-2">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Enviando..." : "Upload"}
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center text-sm text-muted-foreground">
          <Loader2 size={16} className="mr-2 animate-spin" /> Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed bg-card/50 p-10 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border bg-background text-muted-foreground">
            <ImageIcon size={18} strokeWidth={1.6} />
          </div>
          <h2 className="mt-4 text-sm font-medium">
            {items.length === 0 ? "Nenhum arquivo ainda" : "Nenhum resultado"}
          </h2>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {items.length === 0
              ? "Envie imagens ou vídeos para começar a sua biblioteca."
              : "Tente ajustar a busca."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="group relative overflow-hidden rounded-lg border bg-card"
            >
              <button
                type="button"
                onClick={() => setPreview(item)}
                className="block aspect-square w-full bg-muted"
              >
                {item.type === "image" ? (
                  <img
                    src={item.url}
                    alt={item.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="relative h-full w-full">
                    <video
                      src={item.url}
                      className="h-full w-full object-cover"
                      preload="metadata"
                      muted
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                      <Film size={22} />
                    </div>
                  </div>
                )}
              </button>
              <div className="flex items-start justify-between gap-2 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatSize(item.size_bytes)} · {formatDate(item.created_at)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 transition group-hover:opacity-100"
                  onClick={() => setToDelete(item)}
                  aria-label="Excluir"
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview?.type === "image" ? (
            <img
              src={preview.url}
              alt={preview.name}
              className="max-h-[70vh] w-full rounded-md object-contain"
            />
          ) : preview?.type === "video" ? (
            <video
              src={preview.url}
              controls
              className="max-h-[70vh] w-full rounded-md bg-black"
            />
          ) : null}
          {preview && (
            <div className="text-xs text-muted-foreground">
              {formatSize(preview.size_bytes)} · {preview.mime_type} · {formatDate(preview.created_at)}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir arquivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O arquivo será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
