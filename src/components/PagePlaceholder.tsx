import { Construction } from "lucide-react";

interface PagePlaceholderProps {
  title: string;
  description: string;
}

export default function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <div className="space-y-8">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>

      <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed bg-card/50 p-10 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border bg-background text-muted-foreground">
          <Construction size={18} strokeWidth={1.6} />
        </div>
        <h2 className="mt-4 text-sm font-medium">Em breve</h2>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Esta seção faz parte da estrutura inicial do ContentFlow. As funcionalidades serão
          implementadas nas próximas etapas.
        </p>
      </div>
    </div>
  );
}
