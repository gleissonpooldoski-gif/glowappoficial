// Rede/plataforma alvo do agendamento multicanal.
import { Instagram, Youtube, Music2, Facebook, Linkedin, LucideIcon } from "lucide-react";

export type NetworkId = "instagram" | "youtube" | "tiktok" | "facebook" | "linkedin";

export type NetworkMeta = {
  id: NetworkId;
  label: string;
  icon: LucideIcon;
  color: string;
  available: boolean;
  soonLabel?: string;
};

export const NETWORKS: NetworkMeta[] = [
  { id: "instagram", label: "Instagram", icon: Instagram, color: "text-pink-400", available: true },
  { id: "youtube", label: "YouTube", icon: Youtube, color: "text-red-400", available: true },
  { id: "tiktok", label: "TikTok", icon: Music2, color: "text-fuchsia-400", available: true },
  { id: "facebook", label: "Facebook", icon: Facebook, color: "text-blue-400", available: true },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin, color: "text-sky-400", available: false, soonLabel: "em breve" },
];

export const NETWORK_MAP: Record<NetworkId, NetworkMeta> =
  NETWORKS.reduce((acc, n) => ({ ...acc, [n.id]: n }), {} as any);
