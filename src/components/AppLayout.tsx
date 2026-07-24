import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Film, LayoutTemplate, Sparkles, CheckCircle2, Pencil, Menu, X,
  FolderKanban, ChevronsUpDown, Plus, Check, Instagram, Settings as SettingsIcon,
  MessageSquareText, Activity, AlertTriangle,
} from "lucide-react";
import { useHealthBadge } from "@/hooks/useHealthBadge";
import { cn } from "@/lib/utils";
import { useActiveProject } from "@/context/ProjectContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const nav = [
  { to: "/videos", label: "Biblioteca de Vídeos", icon: Film },
  { to: "/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/edits", label: "Projetos de Edição", icon: Pencil },
  { to: "/finished", label: "Vídeos Prontos", icon: CheckCircle2 },
  { to: "/publications", label: "Publicações", icon: Instagram },
  { to: "/comments-config", label: "Config. de Comentários", icon: MessageSquareText },
  { to: "/saude", label: "Saúde do Sistema", icon: Activity },
  { to: "/publications-issues", label: "Publicações com Problema", icon: AlertTriangle },
  { to: "/settings", label: "Configurações", icon: SettingsIcon },
];

function ProjectSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { projects, activeProject, setActiveProjectId } = useActiveProject();
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-left transition hover:border-gold/40">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gold-gradient text-black">
          {activeProject?.logo_url ? (
            <img src={activeProject.logo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <FolderKanban size={16} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">
            Projeto ativo
          </div>
          <div className="truncate text-sm font-medium">
            {activeProject?.name ?? "Nenhum projeto"}
          </div>
        </div>
        <ChevronsUpDown size={14} className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Meus Projetos
        </DropdownMenuLabel>
        {projects.length === 0 && (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            Nenhum projeto ainda.
          </div>
        )}
        {projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => { setActiveProjectId(p.id); onNavigate?.(); }}
            className="flex items-center gap-2"
          >
            <div className="h-6 w-6 shrink-0 overflow-hidden rounded-md bg-muted">
              {p.logo_url ? (
                <img src={p.logo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <FolderKanban size={12} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{p.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">{p.category}</div>
            </div>
            {activeProject?.id === p.id && <Check size={14} className="text-gold" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { navigate("/projects"); onNavigate?.(); }}>
          <FolderKanban size={14} className="mr-2" /> Gerenciar projetos
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { navigate("/projects?new=1"); onNavigate?.(); }}>
          <Plus size={14} className="mr-2" /> Criar novo projeto
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gold-gradient glow-gold">
          <Sparkles size={18} className="text-black" strokeWidth={2.4} />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">ViralFactory</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-gold">Studio</div>
        </div>
      </div>

      <div className="border-b border-sidebar-border px-3 py-3">
        <ProjectSwitcher onNavigate={onNavigate} />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all",
                  isActive
                    ? "bg-sidebar-accent text-gold font-medium shadow-[inset_2px_0_0_hsl(var(--gold))]"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                )
              }
            >
              <Icon size={17} strokeWidth={1.8} />
              {item.label}
            </NavLink>
          );
        })}
        <NavLink
          to="/projects"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all",
              isActive
                ? "bg-sidebar-accent text-gold font-medium shadow-[inset_2px_0_0_hsl(var(--gold))]"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            )
          }
        >
          <FolderKanban size={17} strokeWidth={1.8} />
          Meus Projetos
        </NavLink>
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <div className="rounded-lg glass p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Modo pessoal</p>
          <p className="mt-0.5 text-xs text-foreground/80">Fábrica privada de vídeos</p>
        </div>
      </div>
    </aside>
  );
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { activeProject } = useActiveProject();
  const current = nav.find((n) => location.pathname.startsWith(n.to))?.label ?? "ViralFactory";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-3 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl md:px-8">
          <button
            className="rounded-md p-2 text-muted-foreground hover:bg-muted md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {activeProject?.name ?? "ViralFactory Studio"}
            </div>
            <h1 className="text-sm font-medium">{current}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
              Studio online
            </div>
          </div>
        </header>

        <main
          key={location.pathname}
          className="flex-1 overflow-auto animate-in fade-in duration-200"
        >
          <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
            <Outlet />
          </div>
          <footer className="border-t border-border/60 px-4 py-6 md:px-8">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-xs text-muted-foreground md:flex-row">
              <div>© 2026 Viral Factory. All Rights Reserved.</div>
              <div className="flex items-center gap-4">
                <NavLink to="/privacy" className="hover:text-gold transition">Privacy Policy</NavLink>
                <span className="text-border">•</span>
                <NavLink to="/terms" className="hover:text-gold transition">Terms of Service</NavLink>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
