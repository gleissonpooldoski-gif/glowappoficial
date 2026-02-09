import { useAuth } from "@/contexts/AuthContext";
import { getDayRoutine, markRoutineDone, dayNames, type DayOfWeek, type RoutineStep } from "@/data/routines";
import Layout from "@/components/Layout";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

function StepCard({ step, index }: { step: RoutineStep; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl bg-card overflow-hidden transition-all">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 text-left"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl">
          {step.icon}
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-primary">Etapa {index + 1}</span>
          </div>
          <p className="font-semibold text-sm">{step.name}</p>
          <p className="text-xs text-muted-foreground">{step.description}</p>
        </div>
        {expanded ? <ChevronUp size={18} className="text-muted-foreground mt-1" /> : <ChevronDown size={18} className="text-muted-foreground mt-1" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 animate-fade-in">
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-xs font-semibold text-primary mb-1">💡 O que é?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{step.whatIs}</p>
          </div>

          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-xs font-semibold text-primary mb-1">❤️ Por que é importante?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{step.whyImportant}</p>
          </div>

          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-xs font-semibold text-primary mb-1">🧴 Como fazer</p>
            <ol className="space-y-1 ml-1">
              {step.howTo.map((h, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="font-medium text-primary">{i + 1}.</span>
                  {h}
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl bg-destructive/5 p-3">
            <p className="text-xs font-semibold text-destructive mb-1">⚠️ Erros comuns</p>
            <ul className="space-y-1">
              {step.commonMistakes.map((m, i) => (
                <li key={i} className="text-xs text-muted-foreground">• {m}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RotinaDetalhe() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const period = location.pathname.includes("manha") ? "morning" : "night";
  const dayParam = searchParams.get("day");
  const dayIndex = dayParam ? (parseInt(dayParam) as DayOfWeek) : (new Date().getDay() as DayOfWeek);

  const goal = user?.goal;
  const dayRoutine = goal ? getDayRoutine(goal, dayIndex) : null;
  const steps = dayRoutine ? dayRoutine[period] : [];

  const [done, setDone] = useState(false);

  const handleComplete = () => {
    markRoutineDone(dayIndex, period);
    setDone(true);
    toast({
      title: "Rotina concluída! 🎉",
      description: period === "morning" ? "Rotina da manhã finalizada. Bom dia!" : "Rotina da noite finalizada. Boa noite!",
    });
  };

  return (
    <Layout>
      <header className="mb-4">
        <button onClick={() => navigate("/rotina")} className="flex items-center gap-1 text-sm text-muted-foreground mb-2 hover:text-primary transition-colors">
          <ArrowLeft size={16} />
          Voltar
        </button>
        <h1 className="text-2xl font-bold">
          {period === "morning" ? "☀️ Rotina da Manhã" : "🌙 Rotina da Noite"}
        </h1>
        <p className="text-sm text-muted-foreground">{dayNames[dayIndex]} · {steps.length} etapas</p>
      </header>

      {dayRoutine?.isSpecial && dayRoutine.specialMessage && (
        <div className="mb-4 rounded-2xl glow-gradient-soft p-4 text-center">
          <p className="text-sm font-medium text-foreground">{dayRoutine.specialMessage}</p>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {steps.map((step, i) => (
          <StepCard key={step.id} step={step} index={i} />
        ))}
      </div>

      {!done ? (
        <Button onClick={handleComplete} className="w-full glow-shadow" size="lg">
          <Check size={18} />
          Marcar como concluída
        </Button>
      ) : (
        <div className="text-center rounded-2xl bg-primary/10 p-5">
          <span className="text-3xl">✨</span>
          <p className="mt-2 font-semibold text-primary">Concluída!</p>
          <p className="text-xs text-muted-foreground mt-1">Continue assim, sua pele agradece!</p>
        </div>
      )}
    </Layout>
  );
}
