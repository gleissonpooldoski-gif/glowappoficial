import { supabase } from "@/integrations/supabase/client";

export type ProjectEditModel = {
  id: string;
  project_id: string;
  template_id: string | null;
  aspect_ratio: string;
  doc: any;
  updated_at?: string;
};

/**
 * Modelo/layout padrão de um projeto.
 * Cada projeto possui o seu — nunca compartilhado entre projetos.
 */
export async function getProjectModel(projectId: string | null | undefined): Promise<ProjectEditModel | null> {
  if (!projectId) return null;
  const { data, error } = await (supabase as any)
    .from("project_edit_models")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) {
    console.error("[project-model] load error", error);
    return null;
  }
  return (data as ProjectEditModel) ?? null;
}

export async function saveProjectModel(params: {
  projectId: string;
  templateId: string | null;
  aspectRatio: string;
  doc: any;
}): Promise<void> {
  const { error } = await (supabase as any)
    .from("project_edit_models")
    .upsert(
      {
        project_id: params.projectId,
        template_id: params.templateId,
        aspect_ratio: params.aspectRatio,
        doc: params.doc,
      },
      { onConflict: "project_id" },
    );
  if (error) throw error;
}

/**
 * Aplica o modelo do projeto a todas as edições do lote que NÃO possuem
 * personalização individual (doc_overridden = false).
 * Retorna quantas edições foram atualizadas.
 */
export async function applyModelToBatch(params: {
  projectId: string;
  aspectRatio: string;
  doc: any;
  templateId?: string | null;
  templateUrl?: string | null;
  editIds?: string[];
}): Promise<number> {
  const patch: Record<string, any> = {
    doc: params.doc,
    aspect_ratio: params.aspectRatio,
  };
  if (params.templateId !== undefined) patch.template_id = params.templateId;
  if (params.templateUrl !== undefined) patch.template_url = params.templateUrl;

  let q = (supabase as any)
    .from("edits")
    .update(patch)
    .eq("project_id", params.projectId)
    .eq("doc_overridden", false)
    .in("status", ["draft", "editing"]);

  if (params.editIds?.length) q = q.in("id", params.editIds);

  const { data, error } = await q.select("id");
  if (error) throw error;
  return (data as any[])?.length ?? 0;
}

export async function listBatchEdits(projectId: string | null | undefined) {
  if (!projectId) return [];
  const { data, error } = await (supabase as any)
    .from("edits")
    .select("id, name, video_id, video_filename, doc_overridden, status, created_at")
    .eq("project_id", projectId)
    .in("status", ["draft", "editing"])
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[project-model] batch list error", error);
    return [];
  }
  return (data as any[]) ?? [];
}
