import { Wand2, Hash, Sparkles, Clock, RefreshCw, Languages, Copy, CalendarRange } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const tools = [
  { title: "Gerar legenda", desc: "Crie legendas envolventes a partir de um tópico.", icon: Sparkles },
  { title: "Gerar hashtags", desc: "Sugira hashtags relevantes para o seu nicho.", icon: Hash },
  { title: "Gerar CTA", desc: "Chamadas para ação otimizadas para conversão.", icon: Wand2 },
  { title: "Melhor horário", desc: "Recomende o melhor horário para publicar.", icon: Clock },
  { title: "Reescrever legenda", desc: "Melhore o tom e a clareza de uma legenda.", icon: RefreshCw },
  { title: "Traduzir", desc: "Traduza legendas para outros idiomas.", icon: Languages },
  { title: "Múltiplas versões", desc: "Gere variações A/B do mesmo post.", icon: Copy },
  { title: "Calendário de conteúdo", desc: "Planeje um mês inteiro de conteúdos.", icon: CalendarRange },
];

export default function AI() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">IA</h1>
            <Badge variant="secondary" className="text-[10px]">Em breve</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Ferramentas de IA para acelerar a criação de conteúdo.
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map(({ title, desc, icon: Icon }) => (
          <Card key={title} className="transition hover:border-foreground/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted/40">
                  <Icon size={15} />
                </div>
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">{desc}</p>
              <Button size="sm" variant="outline" disabled className="w-full">
                Em breve
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
