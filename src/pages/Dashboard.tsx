import { useAuth } from "@/contexts/AuthContext";
import { dayNames, getStreak, getWeekCompletionPercent, loadProgress, welcomePhrases } from "@/data/routines";
import Layout from "@/components/Layout";
import { Link } from "react-router-dom";
import { BookOpen, MessageCircle, Flame, CalendarDays, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useMemo } from "react";

export default function Dashboard() {
  const { user } = useAuth();
  const firstName = user?.name?.split(" ")[0] || "você";
  const today = new Date();
  const dayOfWeek = today.getDay();
  const streak = getStreak();
  const weekPercent = getWeekCompletionPercent();
  const progress = loadProgress();

  const phrase = useMemo(() => welcomePhrases[Math.floor(Math.random() * welcomePhrases.length)], []);

  return (
    <Layout>
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">Olá, {firstName} 🌸</p>
        <h1 className="text-2xl font-bold">{dayNames[dayOfWeek]}</h1>
        <p className="mt-1 text-sm text-muted-foreground italic">{phrase}</p>
      </header>

      {/* Streak & Progress */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-2xl bg-card p-4 glow-shadow flex flex-col items-center gap-1">
          <Flame size={24} className="text-primary" />
          <span className="text-2xl font-bold">{streak}</span>
          <span className="text-[10px] text-muted-foreground">dias seguidos</span>
        </div>
        <div className="rounded-2xl bg-card p-4 glow-shadow flex flex-col items-center gap-1">
          <Sparkles size={24} className="text-primary" />
          <span className="text-2xl font-bold">{weekPercent}%</span>
          <span className="text-[10px] text-muted-foreground">da semana</span>
        </div>
      </div>

      {/* Weekly progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Progresso semanal</span>
          <span className="text-xs font-medium text-primary">{weekPercent}%</span>
        </div>
        <Progress value={weekPercent} className="h-2.5" />
      </div>

      {/* Mini Week Calendar */}
      <div className="flex gap-1.5 mb-6 justify-center">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => {
          const isToday = i === dayOfWeek;
          const done = progress[i]?.morning && progress[i]?.night;
          const partial = progress[i]?.morning || progress[i]?.night;
          return (
            <div
              key={i}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                isToday
                  ? "glow-gradient text-primary-foreground glow-shadow"
                  : done
                  ? "bg-primary/20 text-primary"
                  : partial
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? "✓" : d}
            </div>
          );
        })}
      </div>

      {/* Main CTA */}
      <Link
        to="/rotina"
        className="block w-full rounded-2xl glow-gradient p-5 text-center text-primary-foreground glow-shadow transition-all hover:opacity-90 mb-6"
      >
        <CalendarDays size={28} className="mx-auto mb-2" />
        <span className="text-lg font-bold">Ver rotina de hoje</span>
        <p className="text-xs mt-1 opacity-80">Rotina da manhã e da noite</p>
      </Link>

      {/* Quick Access */}
      <section className="grid grid-cols-2 gap-3">
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
