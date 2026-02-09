export type SkinType = "oleosa" | "seca" | "mista" | "normal";
export type SkinGoal = "acne" | "hidratacao" | "glow" | "anti-idade";

export interface RoutineStep {
  name: string;
  description: string;
  icon: string;
}

export interface Routine {
  morning: RoutineStep[];
  night: RoutineStep[];
}

const baseRoutine: Routine = {
  morning: [
    { name: "Limpeza facial", description: "Lave o rosto com um limpador suave", icon: "💧" },
    { name: "Hidratante", description: "Aplique um hidratante adequado ao seu tipo de pele", icon: "🧴" },
    { name: "Protetor solar", description: "Finalize com protetor solar FPS 30+", icon: "☀️" },
  ],
  night: [
    { name: "Limpeza facial", description: "Remova a maquiagem e limpe bem o rosto", icon: "💧" },
    { name: "Hidratante", description: "Aplique um hidratante noturno", icon: "🌙" },
  ],
};

const routinesByGoal: Record<SkinGoal, { morning: RoutineStep[]; night: RoutineStep[] }> = {
  acne: {
    morning: [
      { name: "Limpeza facial", description: "Use um gel de limpeza com ácido salicílico", icon: "💧" },
      { name: "Sérum anti-acne", description: "Aplique sérum com niacinamida", icon: "💎" },
      { name: "Hidratante oil-free", description: "Use um hidratante leve e sem óleo", icon: "🧴" },
      { name: "Protetor solar", description: "Protetor solar oil-free FPS 30+", icon: "☀️" },
    ],
    night: [
      { name: "Limpeza facial", description: "Limpe o rosto com gel de limpeza suave", icon: "💧" },
      { name: "Tratamento anti-acne", description: "Aplique sérum de ácido salicílico 2%", icon: "✨" },
      { name: "Hidratante leve", description: "Hidratante oil-free para a noite", icon: "🌙" },
    ],
  },
  hidratacao: {
    morning: [
      { name: "Limpeza suave", description: "Use um limpador cremoso e hidratante", icon: "💧" },
      { name: "Sérum hidratante", description: "Aplique sérum de ácido hialurônico", icon: "💎" },
      { name: "Hidratante rico", description: "Use um hidratante nutritivo", icon: "🧴" },
      { name: "Protetor solar", description: "Protetor solar hidratante FPS 30+", icon: "☀️" },
    ],
    night: [
      { name: "Limpeza suave", description: "Limpe o rosto com leite de limpeza", icon: "💧" },
      { name: "Sérum hidratante", description: "Aplique sérum de ácido hialurônico", icon: "💎" },
      { name: "Creme noturno", description: "Use um creme nutritivo e reparador", icon: "🌙" },
    ],
  },
  glow: {
    morning: [
      { name: "Limpeza facial", description: "Use um gel de limpeza suave", icon: "💧" },
      { name: "Vitamina C", description: "Aplique sérum de vitamina C", icon: "🍊" },
      { name: "Hidratante iluminador", description: "Use um hidratante com efeito glow", icon: "✨" },
      { name: "Protetor solar", description: "Protetor solar com acabamento luminoso", icon: "☀️" },
    ],
    night: [
      { name: "Limpeza facial", description: "Remova impurezas com limpador suave", icon: "💧" },
      { name: "Esfoliação suave", description: "Use AHA/BHA 2-3x por semana", icon: "🌟" },
      { name: "Sérum nutritivo", description: "Aplique sérum com antioxidantes", icon: "💎" },
      { name: "Hidratante noturno", description: "Hidratante reparador para a noite", icon: "🌙" },
    ],
  },
  "anti-idade": {
    morning: [
      { name: "Limpeza facial", description: "Use um limpador suave e cremoso", icon: "💧" },
      { name: "Vitamina C", description: "Sérum de vitamina C para proteger", icon: "🍊" },
      { name: "Hidratante anti-idade", description: "Use um hidratante com peptídeos", icon: "🧴" },
      { name: "Protetor solar", description: "Protetor solar FPS 50 é essencial", icon: "☀️" },
    ],
    night: [
      { name: "Limpeza facial", description: "Limpe o rosto com limpador suave", icon: "💧" },
      { name: "Retinol", description: "Aplique sérum de retinol (começe devagar)", icon: "✨" },
      { name: "Creme anti-idade", description: "Use um creme com colágeno e peptídeos", icon: "🌙" },
    ],
  },
};

export function getRoutine(skinType: SkinType, goal: SkinGoal): Routine {
  return routinesByGoal[goal] || baseRoutine;
}

export const skinTypeLabels: Record<SkinType, string> = {
  oleosa: "Oleosa",
  seca: "Seca",
  mista: "Mista",
  normal: "Normal",
};

export const goalLabels: Record<SkinGoal, string> = {
  acne: "Acne",
  hidratacao: "Hidratação",
  glow: "Glow",
  "anti-idade": "Anti-idade",
};
