import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { SkinType, SkinGoal, skinTypeLabels, goalLabels } from "@/data/routines";

const skinTypes: { value: SkinType; emoji: string }[] = [
  { value: "oleosa", emoji: "💦" },
  { value: "seca", emoji: "🏜️" },
  { value: "mista", emoji: "⚖️" },
  { value: "normal", emoji: "✨" },
];

const goals: { value: SkinGoal; emoji: string }[] = [
  { value: "acne", emoji: "🎯" },
  { value: "hidratacao", emoji: "💧" },
  { value: "glow", emoji: "🌟" },
  { value: "anti-idade", emoji: "⏳" },
];

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [skinType, setSkinType] = useState<SkinType | null>(null);
  const [goal, setGoal] = useState<SkinGoal | null>(null);
  const { updateProfile } = useAuth();
  const navigate = useNavigate();

  const handleFinish = () => {
    if (skinType && goal) {
      updateProfile({ skinType, goal, onboardingComplete: true });
      navigate("/dashboard");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-6 pt-16">
      {/* Progress */}
      <div className="flex w-full max-w-xs gap-2">
        <div className={`h-1.5 flex-1 rounded-full ${step >= 1 ? "glow-gradient" : "bg-muted"}`} />
        <div className={`h-1.5 flex-1 rounded-full ${step >= 2 ? "glow-gradient" : "bg-muted"}`} />
      </div>

      {step === 1 && (
        <div className="mt-12 w-full max-w-sm">
          <h1 className="text-center text-2xl font-bold">Qual é o seu tipo de pele?</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">Isso nos ajuda a montar sua rotina ideal</p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {skinTypes.map(({ value, emoji }) => (
              <button
                key={value}
                onClick={() => setSkinType(value)}
                className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition-all ${
                  skinType === value
                    ? "border-primary bg-primary/10 glow-shadow"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <span className="text-3xl">{emoji}</span>
                <span className="font-medium">{skinTypeLabels[value]}</span>
              </button>
            ))}
          </div>
          <Button
            className="mt-8 w-full glow-shadow"
            size="lg"
            disabled={!skinType}
            onClick={() => setStep(2)}
          >
            Próximo
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="mt-12 w-full max-w-sm">
          <h1 className="text-center text-2xl font-bold">Qual seu objetivo principal?</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">Personalizamos os conteúdos para você</p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {goals.map(({ value, emoji }) => (
              <button
                key={value}
                onClick={() => setGoal(value)}
                className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition-all ${
                  goal === value
                    ? "border-primary bg-primary/10 glow-shadow"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <span className="text-3xl">{emoji}</span>
                <span className="font-medium">{goalLabels[value]}</span>
              </button>
            ))}
          </div>
          <div className="mt-8 flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1" size="lg">
              Voltar
            </Button>
            <Button className="flex-1 glow-shadow" size="lg" disabled={!goal} onClick={handleFinish}>
              Começar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
