import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Search, Image as ImageIcon, Video, Trash2, Film } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface Media {
  id: string;
  name: string;
  type: "image" | "video";
  storage_path: string;
  mime_type: string | null;
  tags: string[];
  created_at: string;
  url?: string;
}

export default function Library() {
  const { user } = useAuth();
  const [items, setItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("media").select("*").order("created_at", { ascending: false });
    const withUrls: Media[] = await Promise.all(
      (data ?? []).map(async (m: any) => {
        const { data: signed } = await supabase.storage.from("media").createSignedUrl(m.storage_path, 3600);
        return { ...m, url: signed?.signedUrl } as Media;
      })
    );
    setItems(withUrls);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || !user) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const type: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
      const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, file);
      if (upErr) {
        toast.error(`Erro ao enviar ${file.name}: ${upErr.message}`);
        continue;
      }
      const { error: dbErr } = await supabase.from("media").insert({
        user_id: user.id,
        name: file.name,
        type,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (dbErr) toast.error(dbErr.message);
    }
    setUploading(false);
    toast.success("Upload concluído");
    load();
  };

  const handleDelete = async (m: Media) => {
    if (!confirm(`Excluir "${m.name}"?`)) return;
    await supabase.storage.from("media").remove([m.storage_path]);
    await supabase.from("media").delete().eq("id", m.id);
    toast.success("Mídia excluída");
    load();
  };

  const filtered = items.filter((i) => {
    if (filter !== "all" && i.type !== filter) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Biblioteca"
        description="Suas imagens e vídeos"
        actions={
          <>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <Button size="sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
              <Upload size={14} className="mr-1.5" />
              {uploading ? "Enviando..." : "Upload"}
            </Button>
          </>
        }
      />

      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="image">Imagens</TabsTrigger>
            <TabsTrigger value="video">Vídeos</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-12">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border rounded-lg">
          <ImageIcon size={32} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma mídia encontrada</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((m) => (
            <Card key={m.id} className="overflow-hidden group">
              <div className="aspect-square bg-secondary relative">
                {m.type === "image" && m.url ? (
                  <img src={m.url} alt={m.name} className="h-full w-full object-cover" loading="lazy" />
                ) : m.type === "video" && m.url ? (
                  <video src={m.url} className="h-full w-full object-cover" muted />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    {m.type === "video" ? <Film size={28} /> : <ImageIcon size={28} />}
                  </div>
                )}
                <Badge className="absolute top-2 left-2 h-5 text-[10px]" variant="secondary">
                  {m.type === "video" ? <Video size={10} className="mr-1" /> : <ImageIcon size={10} className="mr-1" />}
                  {m.type}
                </Badge>
                <button
                  onClick={() => handleDelete(m)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 rounded-md bg-background/90 flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <CardContent className="p-2.5">
                <p className="text-xs font-medium truncate">{m.name}</p>
                <p className="text-[10px] text-muted-foreground">{format(new Date(m.created_at), "d MMM yyyy", { locale: ptBR })}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
