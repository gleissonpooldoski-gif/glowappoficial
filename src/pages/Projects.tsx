import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, FolderKanban, Trash2, Search, Pencil, Upload, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useActiveProject } from "@/context/ProjectContext";

const CATEGORIES = [
  { value: "motivacao", label: "Motivação" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "curiosidades", label: "Curiosidades" },
  { value: "luxo", label: "Luxo" },
  { value: "saude", label: "Saúde" },
  { value: "futebol", label: "Futebol" },
  { value: "noticias", label: "Notícias" },
  { value: "celebridades", label: "Celebridades" },
  { value: "filmes", label: "Filmes" },
  { value: "carros", label: "Carros" },
  { value: "outro", label: "Outro" },
] as const;

const LOGO_BUCKET = "brand-assets";

type Project = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  logo_url: string | null;
  created_at: string;
};

type FormState = {
  id?: string;
  name: string;
  category: string;
  description: string;
  logo_url: string | null;
  logoFile?: File | null;
};

const emptyForm: FormState = { name: "", category: "outro", description: "", logo_url: null, logoFile: null };

export default function Projects() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { refresh, setActiveProjectId, activeProject } = useActiveProject();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setProjects((data ?? []) as Project[]);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (params.get("new") === "1") {
      setForm(emptyForm);
      setOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const openCreate = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (p: Project) => {
    setForm({
      id: p.id, name: p.name, category: p.category,
      description: p.description ?? "", logo_url: p.logo_url, logoFile: null,
    });
    setOpen(true);
  };

  const onLogoPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Envie uma imagem");
    if (f.size > 5 * 1024 * 1024) return toast.error("Máx 5MB");
    setForm((s) => ({ ...s, logoFile: f, logo_url: URL.createObjectURL(f) }));
  };

  const uploadLogo = async (file: File): Promise<string | null> => {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `logos/${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, { contentType: file.type });
    if (error) { toast.error(error.message); return null; }
    const { data } = await supabase.storage.from(LOGO_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
    return data?.signedUrl ?? null;
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Informe um nome"); return; }
    setSaving(true);
    try {
      let logoUrl = form.logo_url;
      if (form.logoFile) {
        const uploaded = await uploadLogo(form.logoFile);
        if (uploaded) logoUrl = uploaded;
      }
      if (form.id) {
        const { error } = await supabase.from("projects").update({
          name: form.name.trim(),
          category: form.category as any,
          description: form.description,
          logo_url: logoUrl,
        } as any).eq("id", form.id);
        if (error) throw error;
        toast.success("Projeto atualizado");
      } else {
        const { data, error } = await supabase.from("projects").insert({
          name: form.name.trim(),
          category: form.category as any,
          description: form.description,
          logo_url: logoUrl,
        } as any).select("id").single();
        if (error) throw error;
        toast.success("Projeto criado");
        if (data?.id) setActiveProjectId(data.id as string);
      }
      setOpen(false);
      setForm(emptyForm);
      await Promise.all([load(), refresh()]);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar projeto");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este projeto e todos os vídeos, templates e edições vinculados?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Projeto excluído");
    await Promise.all([load(), refresh()]);
  };

  const activate = (id: string) => {
    setActiveProjectId(id);
    toast.success("Projeto ativo atualizado");
    navigate("/videos");
  };

  const filtered = (projects ?? []).filter((p) =>
    (p.name + " " + (p.description ?? "")).toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onLogoPicked} />

      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meus Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Cada projeto tem sua própria biblioteca de vídeos, templates, edições e vídeos prontos.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar projeto..." className="h-9 w-56 pl-8" />
          </div>
          <Button onClick={openCreate} className="bg-gold-gradient text-black hover:opacity-90">
            <Plus size={16} className="mr-1" /> Novo Projeto
          </Button>
        </div>
      </header>

      {!projects ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="glass border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FolderKanban className="text-gold" />
            <p className="text-sm text-muted-foreground">
              Nenhum projeto ainda. Crie o primeiro para começar.
            </p>
            <Button onClick={openCreate} className="bg-gold-gradient text-black">
              <Plus size={14} className="mr-1" /> Criar novo projeto
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const cat = CATEGORIES.find((c) => c.value === p.category)?.label ?? p.category;
            const isActive = activeProject?.id === p.id;
            return (
              <Card key={p.id}
                className={`glass group transition-all hover:-translate-y-0.5 ${isActive ? "border-gold ring-1 ring-gold/50" : "border-border/50 hover:border-gold/40"}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {p.logo_url ? (
                        <img src={p.logo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <FolderKanban size={20} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <Link to={`/projects/${p.id}`} className="min-w-0 flex-1">
                          <h3 className="truncate text-base font-medium group-hover:text-gold">{p.name}</h3>
                        </Link>
                        <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                          <button onClick={() => openEdit(p)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => remove(p.id)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline" className="border-gold/30 text-gold">{cat}</Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(p.created_at), "dd MMM yyyy", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  </div>
                  {p.description && (
                    <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                  )}
                  <div className="mt-3">
                    {isActive ? (
                      <Badge className="bg-gold/20 text-gold border-gold/40" variant="outline">
                        <Check size={12} className="mr-1" /> Projeto ativo
                      </Badge>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 w-full text-[11px]" onClick={() => activate(p.id)}>
                        Ativar este projeto
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar projeto" : "Novo Projeto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 overflow-hidden rounded-lg border border-border/60 bg-muted">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <FolderKanban size={24} />
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-xs text-muted-foreground">Logo (opcional)</p>
                <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload size={12} className="mr-1" /> {form.logo_url ? "Trocar imagem" : "Enviar imagem"}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Nome da página *</label>
              <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="Ex: Página de Filmes" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Nicho</label>
              <Select value={form.category} onValueChange={(v) => setForm((s) => ({ ...s, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Descrição (opcional)</label>
              <Textarea value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                placeholder="Sobre o que é este projeto..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="bg-gold-gradient text-black">
              {saving ? "Salvando..." : form.id ? "Salvar alterações" : "Criar projeto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
