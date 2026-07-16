import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  Film,
  LayoutTemplate,
  Palette,
  Cog,
  Rocket,
  Sparkles,
  CheckCircle2,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Projetos", icon: FolderKanban },
  { to: "/videos", label: "Biblioteca de Vídeos", icon: Film },
  { to: "/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/brand", label: "Minha Marca", icon: Palette },
  { to: "/processing", label: "Processamentos", icon: Rocket },
  { to: "/finished", label: "Vídeos Prontos", icon: CheckCircle2 },
  { to: "/settings", label: "Configurações", icon: Cog },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gold-gradient glow-gold">
          <Sparkles size={18} className="text-black" strokeWidth={2.4} />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">
            ViralFactory
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-gold">Studio</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <div className="rounded-lg glass p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Modo pessoal
          </p>
          <p className="mt-0.5 text-xs text-foreground/80">Fábrica privada de vídeos</p>
        </div>
      </div>
    </aside>
  );
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const current =
    nav.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))
      ?.label ?? "ViralFactory";

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
              ViralFactory Studio
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
        </main>
      </div>
    </div>
  );
}
