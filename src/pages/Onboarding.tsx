import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { SkinType, SkinGoal, skinTypeLabels, skinTypeDescriptions, goalLabels } from "@/data/routines";

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

const ageRanges = ["18-24", "25-34", "35-44", "45+"];

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [skinType, setSkinType] = useState<SkinType | null>(null);
  const [goal, setGoal] = useState<SkinGoal | null>(null);
  const [age, setAge] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const { updateProfile } = useAuth();
  const navigate = useNavigate();

  const totalSteps = 4;

  const handleFinish = () => {
    if (skinType && goal) {
      updateProfile({ skinType, goal, age, city, onboardingComplete: true });
      navigate("/dashboard");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-6 pt-16">
      {/* Progress */}
      <div className="flex w-full max-w-xs gap-2">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${step > i ? "glow-gradient" : "bg-muted"}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="mt-12 w-full max-w-sm animate-fade-in">
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
                <span className="text-[10px] text-muted-foreground text-center leading-tight">{skinTypeDescriptions[value]}</span>
              </button>
            ))}
          </div>
          <Button className="mt-8 w-full glow-shadow" size="lg" disabled={!skinType} onClick={() => setStep(2)}>
            Próximo
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="mt-12 w-full max-w-sm animate-fade-in">
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
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1" size="lg">Voltar</Button>
            <Button className="flex-1 glow-shadow" size="lg" disabled={!goal} onClick={() => setStep(3)}>Próximo</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-12 w-full max-w-sm animate-fade-in">
          <h1 className="text-center text-2xl font-bold">Um pouco mais sobre você</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">Isso ajuda a refinar sua experiência</p>

          <div className="mt-8 space-y-6">
            <div>
              <p className="text-sm font-medium mb-3">Faixa etária</p>
              <div className="grid grid-cols-2 gap-3">
                {ageRanges.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAge(a)}
                    className={`rounded-2xl border-2 p-4 text-sm font-medium transition-all ${
                      age === a ? "border-primary bg-primary/10 glow-shadow" : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    {a} anos
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Cidade ou clima</p>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex: São Paulo, clima úmido"
                maxLength={60}
                className="w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)} className="flex-1" size="lg">Voltar</Button>
            <Button className="flex-1 glow-shadow" size="lg" onClick={() => setStep(4)}>Próximo</Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="mt-20 w-full max-w-sm animate-fade-in text-center">
          <span className="text-6xl">🌸</span>
          <h1 className="mt-6 text-2xl font-bold">Pronto!</h1>
          <p className="mt-3 text-base text-muted-foreground leading-relaxed">
            Criamos uma rotina simples e segura para você. Vamos começar a cuidar da sua pele juntos?
          </p>
          <Button className="mt-10 w-full glow-shadow" size="lg" onClick={handleFinish}>
            Começar minha rotina ✨
          </Button>
        </div>
      )}
    </div>
  );
}
