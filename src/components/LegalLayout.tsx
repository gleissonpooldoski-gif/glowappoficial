import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Section {
  title: string;
  icon: ReactNode;
  content: ReactNode;
}

interface LegalLayoutProps {
  title: string;
  subtitle: string;
  intro: string;
  sections: Section[];
  seoTitle: string;
  seoDescription: string;
}

export default function LegalLayout({
  title,
  subtitle,
  intro,
  sections,
  seoTitle,
  seoDescription,
}: LegalLayoutProps) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = seoTitle;
    let meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute("content") ?? "";
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", seoDescription);
    return () => {
      document.title = prevTitle;
      if (meta && prevDesc) meta.setAttribute("content", prevDesc);
    };
  }, [seoTitle, seoDescription]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4 md:px-8">
          <Link to="/" className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gold-gradient glow-gold">
              <Sparkles size={18} className="text-black" strokeWidth={2.4} />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Viral Factory</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-gold">Studio</div>
            </div>
          </Link>
          <div className="ml-auto flex items-center gap-4 text-xs">
            <Link to="/privacy" className="text-muted-foreground hover:text-gold transition">Privacy</Link>
            <Link to="/terms" className="text-muted-foreground hover:text-gold transition">Terms</Link>
            <Link to="/" className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition">
              <ArrowLeft size={12} /> App
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 md:px-8 md:py-20">
        {/* Hero */}
        <section className="mb-12 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
            {subtitle}
          </div>
          <h1 className="bg-gradient-to-br from-foreground via-foreground to-gold bg-clip-text text-4xl font-semibold tracking-tight text-transparent md:text-5xl">
            {title}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground md:text-base">
            {intro}
          </p>
        </section>

        {/* Sections */}
        <div className="space-y-4">
          {sections.map((s, i) => (
            <Card
              key={i}
              className="glass rounded-2xl p-6 md:p-8 shadow-[var(--shadow-elevated)] animate-in fade-in slide-in-from-bottom-2 duration-500"
              style={{ animationDelay: `${i * 40}ms`, animationFillMode: "both" }}
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-gradient text-black">
                  {s.icon}
                </div>
                <h2 className="text-lg font-semibold tracking-tight md:text-xl">
                  <span className="text-gold">{String(i + 1).padStart(2, "0")}.</span> {s.title}
                </h2>
              </div>
              <div className="prose-legal text-sm leading-relaxed text-foreground/85 md:text-[15px]">
                {s.content}
              </div>
            </Card>
          ))}
        </div>

        <footer className="mt-16 border-t border-border/60 pt-8 text-center text-xs text-muted-foreground">
          <div className="mb-3 flex items-center justify-center gap-4">
            <Link to="/privacy" className="hover:text-gold transition">Privacy Policy</Link>
            <span className="text-border">•</span>
            <Link to="/terms" className="hover:text-gold transition">Terms of Service</Link>
          </div>
          © 2026 Viral Factory. All Rights Reserved.
        </footer>
      </main>
    </div>
  );
}

export function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
      {items.map((it) => (
        <li key={it} className="flex items-start gap-2">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
