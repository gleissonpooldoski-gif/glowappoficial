import { useAuth } from "@/contexts/AuthContext";
import { dayNames, dayNamesShort, getDayRoutine, loadProgress, type DayOfWeek } from "@/data/routines";
import Layout from "@/components/Layout";
import { Link } from "react-router-dom";
import { Sun, Moon, Check, Sparkles } from "lucide-react";
import { useState } from "react";

export default function Rotina() {
  const { user } = useAuth();
  const today = new Date().getDay() as DayOfWeek;
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(today);
  const progress = loadProgress();

  const goal = user?.goal;
  const dayRoutine = goal ? getDayRoutine(goal, selectedDay) : null;
  const dayProgress = progress[selectedDay];

  return (
    <Layout>
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Sua Rotina</h1>
        <p className="text-sm text-muted-foreground">Domingo a domingo, passo a passo</p>
      </header>

      {/* Week Calendar */}
      <div className="flex gap-1.5 mb-6 justify-center">
        {dayNamesShort.map((d, i) => {
          const isSelected = i === selectedDay;
          const isToday = i === today;
          const done = progress[i]?.morning && progress[i]?.night;
          const partial = progress[i]?.morning || progress[i]?.night;
          return (
            <button
              key={i}
              onClick={() => setSelectedDay(i as DayOfWeek)}
              className={`flex flex-col items-center gap-1 rounded-2xl p-2 min-w-[42px] transition-all ${
                isSelected
                  ? "glow-gradient text-primary-foreground glow-shadow"
                  : done
                  ? "bg-primary/20 text-primary"
                  : partial
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span className="text-[10px] font-medium">{d}</span>
              <span className="text-xs font-bold">
                {done ? <Check size={14} /> : isToday ? "•" : ""}
              </span>
            </button>
          );
        })}
      </div>

      {/* Day Title */}
      <div className="mb-4 text-center">
        <h2 className="text-lg font-bold">{dayNames[selectedDay]}</h2>
        {dayRoutine?.isSpecial && (
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-primary">
            <Sparkles size={14} />
            <span>{dayRoutine.specialMessage}</span>
          </div>
        )}
      </div>

      {dayRoutine && (
        <div className="space-y-4">
          {/* Morning */}
          <Link
            to={`/rotina/manha?day=${selectedDay}`}
            className={`block rounded-2xl bg-card p-5 transition-all hover:glow-shadow ${
              dayProgress?.morning ? "ring-2 ring-primary/30" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sun size={22} className="text-primary" />
                <div>
                  <h3 className="font-semibold">Rotina da Manhã</h3>
                  <p className="text-xs text-muted-foreground">{dayRoutine.morning.length} etapas</p>
                </div>
              </div>
              {dayProgress?.morning ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary">
                  <Check size={16} />
                </span>
              ) : (
                <span className="text-xs text-primary font-medium">Iniciar →</span>
              )}
            </div>
            <div className="mt-3 flex gap-1">
              {dayRoutine.morning.map((step, i) => (
                <span key={i} className="text-lg">{step.icon}</span>
              ))}
            </div>
          </Link>

          {/* Night */}
          <Link
            to={`/rotina/noite?day=${selectedDay}`}
            className={`block rounded-2xl bg-card p-5 transition-all hover:glow-shadow ${
              dayProgress?.night ? "ring-2 ring-primary/30" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Moon size={22} className="text-accent-foreground" />
                <div>
                  <h3 className="font-semibold">Rotina da Noite</h3>
                  <p className="text-xs text-muted-foreground">{dayRoutine.night.length} etapas</p>
                </div>
              </div>
              {dayProgress?.night ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary">
                  <Check size={16} />
                </span>
              ) : (
                <span className="text-xs text-primary font-medium">Iniciar →</span>
              )}
            </div>
            <div className="mt-3 flex gap-1">
              {dayRoutine.night.map((step, i) => (
                <span key={i} className="text-lg">{step.icon}</span>
              ))}
            </div>
          </Link>
        </div>
      )}

      {!goal && (
        <p className="mt-8 text-center text-muted-foreground">Complete o onboarding para ver sua rotina.</p>
      )}
    </Layout>
  );
}
