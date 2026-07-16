import { BarChart3, Heart, MessageCircle, Eye, Share2, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const cards = [
  { label: "Curtidas", icon: Heart },
  { label: "Comentários", icon: MessageCircle },
  { label: "Visualizações", icon: Eye },
  { label: "Compartilhamentos", icon: Share2 },
  { label: "Engajamento", icon: TrendingUp },
  { label: "Alcance", icon: Users },
];

export default function Analytics() {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe o desempenho dos seus conteúdos.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <Icon size={15} className="text-muted-foreground" />
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-muted-foreground/50">
                —
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Aguardando integração
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Desempenho ao longo do tempo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[240px] flex-col items-center justify-center rounded-md border border-dashed text-center">
            <BarChart3 size={22} className="text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Sem dados ainda</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Os gráficos serão populados após a conexão com Instagram e TikTok.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
