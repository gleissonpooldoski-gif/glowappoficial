import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, FolderKanban, Trash2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const CATEGORIES = [
  { value: "motivacao", label: "Motivação" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "curiosidades", label: "Curiosidades" },
  { value: "luxo", label: "Luxo" },
  { value: "saude", label: "Saúde" },
  { value: "futebol", label: "Futebol" },
  { value: "noticias", label: "Notícias" },
  { value: "celebridades", label: "Celebridades" },
  { value: "outro", label: "Outro" },
] as const;

type Project = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  created_at: string;
};

export default function Projects() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("outro");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setProjects((data ?? []) as Project[]);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!name.trim()) {
      toast.error("Informe um nome");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("projects").insert({
      name: name.trim(),
      category: category as any,
      description,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Projeto criado");
    setName("");
    setDescription("");
    setCategory("outro");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este projeto e todos os vídeos vinculados?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Projeto excluído");
    load();
  };

  const filtered = (projects ?? []).filter((p) =>
    (p.name + " " + (p.description ?? "")).toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Cada projeto representa uma página/perfil de conteúdo.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar projeto..."
              className="h-9 w-56 pl-8"
            />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gold-gradient text-black hover:opacity-90">
                <Plus size={16} className="mr-1" /> Novo Projeto
              </Button>
            </DialogTrigger>
            <DialogContent className="glass">
              <DialogHeader>
                <DialogTitle>Novo Projeto</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Nome</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Página Motivação" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Categoria</label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Descrição</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Sobre o que é este projeto..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={create} disabled={saving} className="bg-gold-gradient text-black">
                  {saving ? "Salvando..." : "Criar projeto"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {!projects ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="glass border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FolderKanban className="text-gold" />
            <p className="text-sm text-muted-foreground">
              Nenhum projeto ainda. Crie o primeiro para começar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const cat = CATEGORIES.find((c) => c.value === p.category)?.label ?? "Outro";
            return (
              <Card
                key={p.id}
                className="glass border-border/50 group transition-all hover:-translate-y-0.5 hover:border-gold/40"
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <Link to={`/projects/${p.id}`} className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-medium group-hover:text-gold">
                        {p.name}
                      </h3>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline" className="border-gold/30 text-gold">
                          {cat}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(p.created_at), "dd MMM yyyy", { locale: ptBR })}
                        </span>
                      </div>
                    </Link>
                    <button
                      onClick={() => remove(p.id)}
                      className="rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {p.description && (
                    <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                      {p.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
