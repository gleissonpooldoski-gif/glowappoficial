import { useAuth } from "@/contexts/AuthContext";
import { getRoutine } from "@/data/routines";
import Layout from "@/components/Layout";
import { Link } from "react-router-dom";
import { BookOpen, MessageCircle, Droplets, Sun, Moon } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const routine = user?.skinType && user?.goal ? getRoutine(user.skinType, user.goal) : null;

  const firstName = user?.name?.split(" ")[0] || "você";

  return (
    <Layout>
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">Olá, {firstName} 🌸</p>
        <h1 className="text-2xl font-bold">Sua rotina de hoje</h1>
      </header>

      {routine && (
        <div className="space-y-5">
          {/* Morning */}
          <section className="rounded-2xl bg-card p-5 glow-shadow">
            <div className="mb-4 flex items-center gap-2">
              <Sun size={20} className="text-primary" />
              <h2 className="text-lg font-semibold">Rotina da Manhã</h2>
            </div>
            <div className="space-y-3">
              {routine.morning.map((step, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
                  <span className="text-xl">{step.icon}</span>
                  <div>
                    <p className="font-medium text-sm">{step.name}</p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Night */}
          <section className="rounded-2xl bg-card p-5 glow-shadow">
            <div className="mb-4 flex items-center gap-2">
              <Moon size={20} className="text-accent-foreground" />
              <h2 className="text-lg font-semibold">Rotina da Noite</h2>
            </div>
            <div className="space-y-3">
              {routine.night.map((step, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
                  <span className="text-xl">{step.icon}</span>
                  <div>
                    <p className="font-medium text-sm">{step.name}</p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Quick Access */}
      <section className="mt-6 grid grid-cols-3 gap-3">
        <Link to="/meu-plano" className="flex flex-col items-center gap-2 rounded-2xl bg-card p-4 transition-all hover:glow-shadow">
          <Droplets size={24} className="text-primary" />
          <span className="text-xs font-medium">Meu Plano</span>
        </Link>
        <Link to="/tutoriais" className="flex flex-col items-center gap-2 rounded-2xl bg-card p-4 transition-all hover:glow-shadow">
          <BookOpen size={24} className="text-primary" />
          <span className="text-xs font-medium">Tutoriais</span>
        </Link>
        <Link to="/chat" className="flex flex-col items-center gap-2 rounded-2xl bg-card p-4 transition-all hover:glow-shadow">
          <MessageCircle size={24} className="text-primary" />
          <span className="text-xs font-medium">Chat</span>
        </Link>
      </section>
    </Layout>
  );
}
