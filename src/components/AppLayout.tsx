import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Image as ImageIcon,
  PlusSquare,
  Calendar,
  History,
  Settings,
  Menu,
  X,
  Moon,
  Sun,
  Search,
  Sparkles,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/library", label: "Biblioteca", icon: ImageIcon },
  { to: "/new", label: "Novo Post", icon: PlusSquare },
  { to: "/calendar", label: "Calendário", icon: Calendar },
  { to: "/history", label: "Histórico", icon: History },
  { to: "/settings", label: "Configurações", icon: Settings },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full w-60 flex-col border-r bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b px-5">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Sparkles size={14} strokeWidth={2} />
        </div>
        <span className="text-sm font-semibold tracking-tight">ContentFlow</span>
      </div>
      <nav className="flex-1 space-y-0.5 p-3">
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
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                )
              }
            >
              <Icon size={16} strokeWidth={1.8} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <div className="rounded-md bg-sidebar-accent/50 px-3 py-2.5">
          <p className="text-xs font-medium text-sidebar-foreground">Workspace pessoal</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">v0.1 · em desenvolvimento</p>
        </div>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const currentLabel =
    nav.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))?.label ??
    "ContentFlow";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <SidebarContent />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </Button>

          <h1 className="text-sm font-medium">{currentLabel}</h1>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Buscar..."
                className="h-8 w-56 pl-8 text-sm"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Alternar tema"
            >
              <Sun size={16} className="hidden dark:block" />
              <Moon size={16} className="dark:hidden" />
            </Button>
          </div>
        </header>

        <main
          key={location.pathname}
          className="flex-1 overflow-auto animate-in fade-in duration-200"
        >
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
