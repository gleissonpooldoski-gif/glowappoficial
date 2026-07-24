import { supabase } from "@/integrations/supabase/client";

export type PreflightPlatform = "instagram" | "facebook" | "youtube" | "tiktok";
export interface PreflightBlocker {
  platform: PreflightPlatform;
  reason: string;
  action: "reconnect" | "link_account" | "check_video" | "none";
}
export interface PreflightResult {
  ok: boolean;
  blockers: PreflightBlocker[];
}

export async function runPreflightCheck(params: {
  projectId?: string | null;
  projectName?: string | null;
  platforms: PreflightPlatform[];
  videoId?: string | null;
}): Promise<PreflightResult> {
  try {
    const { data, error } = await supabase.functions.invoke("preflight-check", {
      body: {
        project_id: params.projectId ?? null,
        project_name: params.projectName ?? null,
        platforms: params.platforms,
        video_id: params.videoId ?? null,
      },
    });
    if (error) return { ok: false, blockers: [{ platform: params.platforms[0], reason: error.message, action: "none" }] };
    return data as PreflightResult;
  } catch (e) {
    return { ok: false, blockers: [{ platform: params.platforms[0], reason: String(e), action: "none" }] };
  }
}

export function platformLabel(p: PreflightPlatform): string {
  return { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" }[p];
}
