import { useAuth } from "@/contexts/AuthContext";
import { getRoutine, skinTypeLabels, goalLabels } from "@/data/routines";
import Layout from "@/components/Layout";
import { Sun, Moon } from "lucide-react";

export default function MeuPlano() {
  const { user } = useAuth();
  const routine = user?.skinType && user?.goal ? getRoutine(user.skinType, user.goal) : null;

  return (
    <Layout>
      <header className="mb-2">
        <h1 className="text-2xl font-bold">Meu Plano</h1>
        {user?.skinType && user?.goal && (
          <p className="text-sm text-muted-foreground">
            Pele {skinTypeLabels[user.skinType]} · Foco em {goalLabels[user.goal]}
          </p>
        )}
      </header>

      {routine ? (
        <div className="mt-6 space-y-6">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Sun size={20} className="text-primary" />
              <h2 className="text-lg font-semibold">Rotina da Manhã</h2>
            </div>
            <div className="space-y-2">
              {routine.morning.map((step, i) => (
                <div key={i} className="flex items-start gap-3 rounded-2xl bg-card p-4 glow-shadow">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-lg">{step.icon}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{step.name}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">{i + 1}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <Moon size={20} className="text-primary" />
              <h2 className="text-lg font-semibold">Rotina da Noite</h2>
            </div>
            <div className="space-y-2">
              {routine.night.map((step, i) => (
                <div key={i} className="flex items-start gap-3 rounded-2xl bg-card p-4 glow-shadow">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/50 text-lg">{step.icon}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{step.name}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">{i + 1}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <p className="mt-8 text-center text-muted-foreground">Complete o onboarding para ver seu plano.</p>
      )}
    </Layout>
  );
}
