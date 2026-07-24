// Dicionário de erros para exibição amigável na UI.
export function translatePublishError(code: string | null, fallback = "Erro desconhecido"): string {
  if (!code) return fallback;
  if (code.startsWith("TOKEN_EXPIRED")) return "Token expirado — reconecte a conta.";
  if (code.startsWith("PERMISSION_DENIED")) return "Permissão insuficiente — reconecte autorizando todos os escopos.";
  if (code.startsWith("VIDEO_INVALID")) return "Vídeo rejeitado (formato ou duração inválidos).";
  if (code.startsWith("DUPLICATE")) return "Conteúdo identificado como duplicado.";
  if (code.startsWith("TRANSIENT")) return "Instabilidade temporária da API — tentando novamente.";
  return fallback;
}

export function statusLabel(status: string): { label: string; color: string } {
  switch (status) {
    case "PENDING": return { label: "Aguardando", color: "bg-slate-500/20 text-slate-300" };
    case "PROCESSING": return { label: "Publicando…", color: "bg-blue-500/20 text-blue-300" };
    case "PUBLISHED": return { label: "Publicado", color: "bg-emerald-500/20 text-emerald-300" };
    case "RETRYING": return { label: "Tentando novamente", color: "bg-amber-500/20 text-amber-300" };
    case "FAILED": return { label: "Falhou", color: "bg-red-500/20 text-red-300" };
    case "NEEDS_ATTENTION": return { label: "Precisa atenção", color: "bg-orange-500/20 text-orange-300" };
    default: return { label: status, color: "bg-muted text-muted-foreground" };
  }
}

export function platformEmoji(p: string): string {
  return { instagram: "📷", facebook: "🔵", youtube: "🔴", tiktok: "🎵" }[p] ?? "📤";
}
