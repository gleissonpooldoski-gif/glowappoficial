import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, CalendarDays, BookOpen, MessageCircle, User } from "lucide-react";

const navItems = [
  { path: "/dashboard", label: "Início", icon: Home },
  { path: "/rotina", label: "Rotina", icon: CalendarDays },
  { path: "/tutoriais", label: "Aprenda", icon: BookOpen },
  { path: "/chat", label: "Chat", icon: MessageCircle },
  { path: "/perfil", label: "Perfil", icon: User },
];

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background pb-20">
      <main className="mx-auto max-w-lg px-4 pt-6">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-lg items-center justify-around py-2">
          {navItems.map(({ path, label, icon: Icon }) => {
            const active = location.pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 text-xs transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                <span className={active ? "font-semibold" : ""}>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
