import { useAuth } from "@/contexts/AuthContext";
import { skinTypeLabels, goalLabels, SkinType, SkinGoal } from "@/data/routines";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { LogOut, ChevronRight } from "lucide-react";
import { useState } from "react";

const skinTypes: SkinType[] = ["oleosa", "seca", "mista", "normal"];
const goals: SkinGoal[] = ["acne", "hidratacao", "glow", "anti-idade"];

export default function Perfil() {
  const { user, logout, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [skinType, setSkinType] = useState<SkinType | undefined>(user?.skinType);
  const [goal, setGoal] = useState<SkinGoal | undefined>(user?.goal);

  const handleSave = () => {
    updateProfile({ skinType, goal });
    setEditing(false);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <Layout>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Meu Perfil</h1>
      </header>

      <div className="space-y-4">
        {/* User Info */}
        <div className="rounded-2xl bg-card p-5 glow-shadow">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full glow-gradient text-2xl font-bold text-primary-foreground">
              {user?.name?.[0]?.toUpperCase() || "?"}
            </div>
            <div>
              <p className="font-semibold text-lg">{user?.name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Skin Profile */}
        <div className="rounded-2xl bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Perfil da Pele</h2>
            <button onClick={() => setEditing(!editing)} className="text-sm text-primary hover:underline">
              {editing ? "Cancelar" : "Editar"}
            </button>
          </div>

          {editing ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Tipo de pele</p>
                <div className="grid grid-cols-2 gap-2">
                  {skinTypes.map((st) => (
                    <button
                      key={st}
                      onClick={() => setSkinType(st)}
                      className={`rounded-xl border-2 p-3 text-sm font-medium transition-all ${
                        skinType === st ? "border-primary bg-primary/10" : "border-border"
                      }`}
                    >
                      {skinTypeLabels[st]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Objetivo</p>
                <div className="grid grid-cols-2 gap-2">
                  {goals.map((g) => (
                    <button
                      key={g}
                      onClick={() => setGoal(g)}
                      className={`rounded-xl border-2 p-3 text-sm font-medium transition-all ${
                        goal === g ? "border-primary bg-primary/10" : "border-border"
                      }`}
                    >
                      {goalLabels[g]}
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={handleSave} className="w-full glow-shadow">Salvar</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
                <span className="text-sm text-muted-foreground">Tipo de pele</span>
                <span className="text-sm font-medium">{user?.skinType ? skinTypeLabels[user.skinType] : "—"}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
                <span className="text-sm text-muted-foreground">Objetivo</span>
                <span className="text-sm font-medium">{user?.goal ? goalLabels[user.goal] : "—"}</span>
              </div>
            </div>
          )}
        </div>

        {/* Subscription placeholder */}
        <button className="flex w-full items-center justify-between rounded-2xl bg-card p-5">
          <span className="font-medium text-sm">Gerenciar assinatura</span>
          <ChevronRight size={18} className="text-muted-foreground" />
        </button>

        {/* Logout */}
        <Button variant="outline" onClick={handleLogout} className="w-full" size="lg">
          <LogOut size={18} />
          Sair da conta
        </Button>
      </div>
    </Layout>
  );
}
