import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ActiveProject = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  logo_url: string | null;
};

type Ctx = {
  projects: ActiveProject[];
  activeProject: ActiveProject | null;
  loading: boolean;
  setActiveProjectId: (id: string) => void;
  refresh: () => Promise<void>;
};

const ProjectContext = createContext<Ctx | undefined>(undefined);
const STORAGE_KEY = "vf.activeProjectId";

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<ActiveProject[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("projects")
      .select("id, name, category, description, logo_url")
      .order("created_at", { ascending: false });
    const list = (data ?? []) as ActiveProject[];
    setProjects(list);
    setActiveId((current) => {
      if (current && list.some((p) => p.id === current)) return current;
      const first = list[0]?.id ?? null;
      if (first) localStorage.setItem(STORAGE_KEY, first);
      else localStorage.removeItem(STORAGE_KEY);
      return first;
    });
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const setActiveProjectId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setActiveId(id);
  }, []);

  const activeProject = projects.find((p) => p.id === activeId) ?? null;

  return (
    <ProjectContext.Provider value={{ projects, activeProject, loading, setActiveProjectId, refresh }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useActiveProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useActiveProject must be used within ProjectProvider");
  return ctx;
}
