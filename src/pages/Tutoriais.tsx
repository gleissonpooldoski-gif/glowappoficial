import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { tutorialCategories } from "@/data/tutorials";
import { ChevronRight } from "lucide-react";

export default function Tutoriais() {
  return (
    <Layout>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Tutoriais</h1>
        <p className="text-sm text-muted-foreground">Aprenda a cuidar da sua pele</p>
      </header>

      <div className="space-y-3">
        {tutorialCategories.map((cat) => (
          <Link
            key={cat.id}
            to={`/tutoriais/${cat.id}`}
            className="flex items-center gap-4 rounded-2xl bg-card p-4 transition-all hover:glow-shadow"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-2xl">
              {cat.icon}
            </span>
            <div className="flex-1">
              <p className="font-semibold">{cat.title}</p>
              <p className="text-xs text-muted-foreground">{cat.description}</p>
            </div>
            <ChevronRight size={18} className="text-muted-foreground" />
          </Link>
        ))}
      </div>
    </Layout>
  );
}
