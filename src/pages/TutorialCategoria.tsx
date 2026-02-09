import { useParams, Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { tutorialCategories } from "@/data/tutorials";
import { ArrowLeft, Clock } from "lucide-react";
import { useState } from "react";

export default function TutorialCategoria() {
  const { categoria } = useParams();
  const category = tutorialCategories.find((c) => c.id === categoria);
  const [openTutorial, setOpenTutorial] = useState<string | null>(null);

  if (!category) {
    return (
      <Layout>
        <p className="text-center text-muted-foreground">Categoria não encontrada.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <Link to="/tutoriais" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} /> Voltar
      </Link>

      <header className="mb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{category.icon}</span>
          <div>
            <h1 className="text-xl font-bold">{category.title}</h1>
            <p className="text-xs text-muted-foreground">{category.tutorials.length} artigo{category.tutorials.length > 1 ? "s" : ""}</p>
          </div>
        </div>
      </header>

      <div className="space-y-3">
        {category.tutorials.map((tutorial) => (
          <div key={tutorial.id} className="rounded-2xl bg-card overflow-hidden transition-all">
            <button
              onClick={() => setOpenTutorial(openTutorial === tutorial.id ? null : tutorial.id)}
              className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/30"
            >
              <div className="flex-1">
                <p className="font-semibold text-sm">{tutorial.title}</p>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock size={12} />
                  {tutorial.readTime}
                </div>
              </div>
            </button>
            {openTutorial === tutorial.id && (
              <div className="border-t border-border px-4 py-4">
                <div className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground">
                  {tutorial.content.split("\n").map((line, i) => {
                    if (line.startsWith("**") && line.endsWith("**")) {
                      return <p key={i} className="font-bold mt-3 mb-1">{line.replace(/\*\*/g, "")}</p>;
                    }
                    if (line.startsWith("- ")) {
                      return <p key={i} className="ml-3 text-muted-foreground">• {line.slice(2).replace(/\*\*/g, "")}</p>;
                    }
                    if (/^\d+\./.test(line)) {
                      return <p key={i} className="ml-3 text-muted-foreground">{line.replace(/\*\*/g, "")}</p>;
                    }
                    if (line.trim() === "") return <br key={i} />;
                    return <p key={i} className="text-muted-foreground">{line.replace(/\*\*/g, "")}</p>;
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Layout>
  );
}
