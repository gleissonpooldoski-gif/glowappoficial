import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutTemplate, Upload, Pencil, Trash2, Search, Play, Image as ImageIcon,
  FolderOpen, Loader2, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatBytes } from "@/lib/format";

const BUCKET = "media";
const CATEGORIES = ["Geral", "Intro", "Outro", "Overlay", "Transição", "Legenda", "Chamada", "Vinheta"];

type Template = {
  id: string;
  name: string;
  description: string | null;
  preview_url: string | null;
  file_path: string | null;
  file_type: string | null;
  category: string | null;
  created_at?: string;
  updated_at?: string;
};

type EditState = {
  id?: string;
  name: string;
  description: string;
  category: string;
};

const emptyEdit: EditState = { name: "", description: "", category: "Geral" };

export default function Templates() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [edit, setEdit] = useState<EditState>(emptyEdit);
  const [editOpen, setEditOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Template | null>(null);
  const [previewing, setPreviewing] = useState<Template | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setTemplates((data ?? []) as Template[]);
  };

  useEffect(() => {
    load();
  }, []);

  // ---------- Upload ----------
  const openFileDialog = () => fileInputRef.current?.click();

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ok = file.type.startsWith("video/") || file.type.startsWith("image/");
    if (!ok) return toast.error("Apenas vídeo ou imagem são aceitos como template");
    if (file.size > 200 * 1024 * 1024) return toast.error("Arquivo acima de 200MB");
    setPendingFile(file);
    setEdit({
      name: file.name.replace(/\.[^.]+$/, ""),
      description: "",
      category: "Geral",
    });
    setEditOpen(true);
  };

  const confirmUpload = async () => {
    if (!pendingFile) return;
    if (!edit.name.trim()) return toast.error("Informe o nome do template");
    const file = pendingFile;
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `templates/${Date.now()}-${safe}`;
    setEditOpen(false);
    setUploading({ name: file.name, progress: 10 });
    try {
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      setUploading({ name: file.name, progress: 70 });

      const { data: signed, error: sErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (sErr) throw sErr;

      const { error: insErr } = await supabase.from("templates").insert({
        name: edit.name.trim(),
        description: edit.description.trim() || null,
        category: edit.category || "Geral",
        preview_url: signed.signedUrl,
        file_path: path,
        file_type: file.type,
        is_builtin: false,
        settings: {},
      });
      if (insErr) throw insErr;

      setUploading({ name: file.name, progress: 100 });
      toast.success("Template adicionado à biblioteca");
      setPendingFile(null);
      setEdit(emptyEdit);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Falha ao enviar template");
    } finally {
      setTimeout(() => setUploading(null), 400);
    }
  };

  // ---------- Edit info ----------
  const openEdit = (t: Template) => {
    setPendingFile(null);
    setEdit({
      id: t.id,
      name: t.name,
      description: t.description ?? "",
      category: t.category ?? "Geral",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!edit.id) return confirmUpload();
    if (!edit.name.trim()) return toast.error("Informe o nome");
    const { error } = await supabase
      .from("templates")
      .update({
        name: edit.name.trim(),
        description: edit.description.trim() || null,
        category: edit.category || "Geral",
      })
      .eq("id", edit.id);
    if (error) return toast.error(error.message);
    toast.success("Template atualizado");
    setEditOpen(false);
    setEdit(emptyEdit);
    load();
  };

  // ---------- Delete ----------
  const remove = async () => {
    if (!toDelete) return;
    const t = toDelete;
    setToDelete(null);
    if (t.file_path) {
      await supabase.storage.from(BUCKET).remove([t.file_path]);
    }
    const { error } = await supabase.from("templates").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Template excluído");
    load();
  };

  // ---------- Filter ----------
  const filtered = (templates ?? []).filter((t) => {
    if (categoryFilter !== "all" && (t.category ?? "Geral") !== categoryFilter) return false;
    if (q && !`${t.name} ${t.description ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const isVideo = (t: Template) => (t.file_type ?? "").startsWith("video/");

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*"
        hidden
        onChange={onFilePicked}
      />

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Biblioteca de Templates</h1>
          <p className="text-sm text-muted-foreground">
            Envie seus próprios templates (vídeo ou imagem) e aplique em lote nos seus vídeos.
          </p>
        </div>
        <Button
          onClick={openFileDialog}
          className="bg-gold-gradient text-black glow-gold"
        >
          <Upload size={16} className="mr-1" /> Enviar Template
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou descrição..."
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {uploading && (
        <Card className="glass border-gold/30">
          <CardContent className="flex items-center gap-3 py-3 text-xs">
            <Loader2 size={14} className="animate-spin text-gold" />
            <span className="flex-1 truncate">Enviando: {uploading.name}</span>
            <span className="text-muted-foreground">{uploading.progress}%</span>
          </CardContent>
        </Card>
      )}

      {!templates ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="glass border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <FolderOpen size={40} className="text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Nenhum template ainda</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Envie seu primeiro template para começar sua biblioteca pessoal.
              </p>
            </div>
            <Button onClick={openFileDialog} className="bg-gold-gradient text-black glow-gold">
              <Upload size={14} className="mr-1" /> Enviar Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((t) => (
            <Card
              key={t.id}
              className="glass border-border/50 group overflow-hidden transition-all hover:-translate-y-0.5 hover:border-gold/40"
            >
              <div
                className="relative aspect-[9/12] cursor-pointer bg-black"
                onClick={() => setPreviewing(t)}
              >
                {t.preview_url ? (
                  isVideo(t) ? (
                    <video
                      src={t.preview_url}
                      className="h-full w-full object-cover"
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                      onMouseLeave={(e) => {
                        const v = e.currentTarget as HTMLVideoElement;
                        v.pause(); v.currentTime = 0;
                      }}
                    />
                  ) : (
                    <img src={t.preview_url} alt={t.name} className="h-full w-full object-cover" />
                  )
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <ImageIcon size={32} />
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute right-2 top-2 flex gap-1">
                  <Badge variant="outline" className="border-gold/30 bg-black/60 text-[10px] text-gold backdrop-blur">
                    {isVideo(t) ? "Vídeo" : "Imagem"}
                  </Badge>
                </div>
                <div className="absolute bottom-2 left-2">
                  <Badge variant="outline" className="border-white/20 bg-black/60 text-[10px] backdrop-blur">
                    {t.category ?? "Geral"}
                  </Badge>
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="rounded-full bg-black/60 p-3 backdrop-blur">
                    <Play size={20} className="text-white" fill="white" />
                  </div>
                </div>
              </div>
              <CardContent className="p-3">
                <h3 className="truncate text-sm font-medium">{t.name}</h3>
                <p className="mt-0.5 line-clamp-2 min-h-[2rem] text-xs text-muted-foreground">
                  {t.description || <span className="italic opacity-60">Sem descrição</span>}
                </p>
                <div className="mt-3 flex gap-1">
                  <Button variant="outline" size="sm" className="h-7 flex-1 text-xs"
                    onClick={() => openEdit(t)}>
                    <Pencil size={12} className="mr-1" /> Editar
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => setToDelete(t)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="glass border-dashed">
        <CardContent className="flex items-center gap-3 py-4 text-xs text-muted-foreground">
          <LayoutTemplate size={14} className="text-gold" />
          Selecione vídeos em{" "}
          <button className="text-gold underline underline-offset-2" onClick={() => navigate("/videos")}>
            Biblioteca de Vídeos
          </button>{" "}
          e aplique um destes templates em lote.
        </CardContent>
      </Card>

      {/* Preview dialog */}
      <Dialog open={!!previewing} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DialogContent className="max-w-[90vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{previewing?.name}</DialogTitle>
            <DialogDescription>
              {previewing?.category ?? "Geral"}
              {previewing?.description ? ` — ${previewing.description}` : ""}
            </DialogDescription>
          </DialogHeader>
          {previewing?.preview_url && (
            isVideo(previewing) ? (
              <video src={previewing.preview_url} controls autoPlay loop className="w-full rounded-md bg-black" />
            ) : (
              <img src={previewing.preview_url} alt={previewing.name} className="w-full rounded-md" />
            )
          )}
        </DialogContent>
      </Dialog>

      {/* Edit / upload metadata dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) { setEditOpen(false); setPendingFile(null); setEdit(emptyEdit); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingFile ? "Novo template" : "Editar template"}
            </DialogTitle>
            <DialogDescription>
              {pendingFile
                ? `Arquivo: ${pendingFile.name} (${formatBytes(pendingFile.size)})`
                : "Atualize as informações do template."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input
                autoFocus
                value={edit.name}
                onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))}
                placeholder="Ex: Intro Podcast Ouro"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Textarea
                value={edit.description}
                onChange={(e) => setEdit((s) => ({ ...s, description: e.target.value }))}
                placeholder="Detalhes do template..."
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <Select value={edit.category} onValueChange={(v) => setEdit((s) => ({ ...s, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEditOpen(false); setPendingFile(null); setEdit(emptyEdit); }}>
              <X size={14} className="mr-1" /> Cancelar
            </Button>
            <Button onClick={saveEdit} className="bg-gold-gradient text-black glow-gold">
              {pendingFile ? <><Upload size={14} className="mr-1" /> Enviar</> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.name}" será removido permanentemente da biblioteca e do armazenamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
