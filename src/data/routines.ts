export type SkinType = "oleosa" | "seca" | "mista" | "normal";
export type SkinGoal = "acne" | "hidratacao" | "glow" | "anti-idade";
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sunday

export interface RoutineStep {
  id: string;
  name: string;
  description: string;
  icon: string;
  whatIs: string;
  whyImportant: string;
  howTo: string[];
  commonMistakes: string[];
}

export interface DayRoutine {
  morning: RoutineStep[];
  night: RoutineStep[];
  isSpecial: boolean;
  specialMessage?: string;
}

export interface Routine {
  morning: RoutineStep[];
  night: RoutineStep[];
}

// Day names in Portuguese
export const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const dayNamesShort = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ---- Detailed Steps ----

const limpezaBasica: RoutineStep = {
  id: "limpeza",
  name: "Limpeza Facial",
  description: "Lave o rosto com um limpador suave",
  icon: "💧",
  whatIs: "A limpeza é o primeiro passo de qualquer rotina de skincare. Remove sujeira, oleosidade e impurezas acumuladas na pele.",
  whyImportant: "Sem uma pele limpa, os outros produtos não conseguem agir corretamente. Além disso, a sujeira acumulada pode causar cravos e espinhas.",
  howTo: [
    "Molhe o rosto com água morna",
    "Aplique uma pequena quantidade do limpador nas mãos",
    "Massageie suavemente o rosto em movimentos circulares por 30 a 60 segundos",
    "Enxágue bem com água e seque com uma toalha limpa, sem esfregar"
  ],
  commonMistakes: [
    "Lavar o rosto com água muito quente",
    "Esfregar a pele com força",
    "Pular a limpeza por preguiça",
    "Usar sabonete de corpo no rosto"
  ]
};

const hidratante: RoutineStep = {
  id: "hidratacao",
  name: "Hidratação",
  description: "Aplique um hidratante adequado ao seu tipo de pele",
  icon: "🧴",
  whatIs: "O hidratante repõe a água e os nutrientes que a pele perde ao longo do dia, mantendo-a macia e saudável.",
  whyImportant: "Toda pele precisa de hidratação, até a oleosa! Sem hidratante, a pele pode ficar ressecada, descamando ou produzir ainda mais oleosidade.",
  howTo: [
    "Aplique o hidratante logo após a limpeza, com a pele ainda levemente úmida",
    "Use uma quantidade do tamanho de uma ervilha",
    "Espalhe com movimentos suaves de dentro para fora",
    "Não esqueça do pescoço!"
  ],
  commonMistakes: [
    "Usar hidratante muito pesado para pele oleosa",
    "Pular a hidratação achando que não precisa",
    "Aplicar em excesso",
    "Esperar muito tempo após a limpeza para aplicar"
  ]
};

const protetor: RoutineStep = {
  id: "protetor",
  name: "Protetor Solar",
  description: "Finalize com protetor solar FPS 30+",
  icon: "☀️",
  whatIs: "O protetor solar cria uma barreira que protege sua pele dos raios UV, que causam envelhecimento, manchas e até câncer de pele.",
  whyImportant: "É o passo mais importante do skincare! Sem proteção solar, todos os outros cuidados perdem eficácia. O sol é o principal fator de envelhecimento da pele.",
  howTo: [
    "Aplique generosamente após o hidratante (equivalente a 3 dedos)",
    "Espalhe por todo o rosto, pescoço e orelhas",
    "Aguarde 2-3 minutos antes de sair de casa",
    "Reaplique a cada 2 horas se ficar exposto ao sol"
  ],
  commonMistakes: [
    "Aplicar pouca quantidade",
    "Não reaplicar ao longo do dia",
    "Achar que não precisa em dias nublados",
    "Usar apenas na praia"
  ]
};

const serumAntiAcne: RoutineStep = {
  id: "serum-acne",
  name: "Sérum Anti-Acne",
  description: "Aplique sérum com niacinamida",
  icon: "💎",
  whatIs: "O sérum é um produto concentrado que trata problemas específicos da pele. A niacinamida ajuda a controlar a oleosidade e reduzir poros.",
  whyImportant: "Ativos como niacinamida e ácido salicílico ajudam a combater espinhas e controlar a oleosidade de forma eficaz.",
  howTo: [
    "Aplique 2-3 gotas nas mãos",
    "Distribua suavemente pelo rosto",
    "Pressione levemente com as pontas dos dedos para ajudar na absorção",
    "Espere 1 minuto antes do próximo passo"
  ],
  commonMistakes: [
    "Misturar vários ácidos ao mesmo tempo",
    "Usar em excesso",
    "Não ter paciência para ver resultados (leva semanas)"
  ]
};

const serumHidratante: RoutineStep = {
  id: "serum-hidratante",
  name: "Sérum Hidratante",
  description: "Aplique sérum de ácido hialurônico",
  icon: "💎",
  whatIs: "O ácido hialurônico é uma molécula que atrai e retém água na pele, proporcionando hidratação profunda e preenchimento.",
  whyImportant: "Ele ajuda a manter a pele sempre hidratada, preenchida e com aparência saudável e jovem.",
  howTo: [
    "Aplique na pele úmida para potencializar o efeito",
    "Use 2-3 gotas",
    "Pressione suavemente no rosto",
    "Sele com o hidratante em seguida"
  ],
  commonMistakes: [
    "Aplicar na pele seca (ele precisa de água para funcionar)",
    "Usar sem selar com hidratante depois"
  ]
};

const vitamina_c: RoutineStep = {
  id: "vitamina-c",
  name: "Vitamina C",
  description: "Aplique sérum de vitamina C",
  icon: "🍊",
  whatIs: "A vitamina C é um antioxidante poderoso que protege a pele contra danos ambientais e ajuda a clarear manchas.",
  whyImportant: "Ela uniformiza o tom da pele, dá luminosidade e potencializa a proteção solar.",
  howTo: [
    "Aplique 3-4 gotas no rosto limpo",
    "Espalhe suavemente",
    "Espere secar antes do hidratante",
    "Use sempre pela manhã, antes do protetor solar"
  ],
  commonMistakes: [
    "Usar junto com ácidos fortes",
    "Guardar em local quente ou com luz",
    "Usar à noite sem combinar com protetor no dia seguinte"
  ]
};

const retinol: RoutineStep = {
  id: "retinol",
  name: "Retinol",
  description: "Aplique sérum de retinol (comece devagar)",
  icon: "✨",
  whatIs: "O retinol é derivado da vitamina A e estimula a renovação celular, ajudando com rugas, manchas e textura.",
  whyImportant: "É um dos ativos mais eficazes contra sinais de envelhecimento, mas exige paciência e cuidado.",
  howTo: [
    "Use apenas à noite",
    "Comece com 1-2x por semana e vá aumentando",
    "Aplique uma quantidade mínima",
    "Sempre use protetor solar no dia seguinte"
  ],
  commonMistakes: [
    "Começar com concentrações altas",
    "Usar todos os dias no início",
    "Misturar com outros ácidos",
    "Esquecer do protetor solar"
  ]
};

const esfoliacao: RoutineStep = {
  id: "esfoliacao",
  name: "Esfoliação Suave",
  description: "Use AHA/BHA 2-3x por semana",
  icon: "🌟",
  whatIs: "A esfoliação remove células mortas da superfície da pele, revelando uma pele mais luminosa e uniforme.",
  whyImportant: "Ajuda a desobstruir poros, melhorar a textura e permitir que outros produtos penetrem melhor.",
  howTo: [
    "Use apenas 2-3 vezes por semana",
    "Aplique à noite após a limpeza",
    "Deixe agir conforme instruções do produto",
    "Hidrate bem após o uso"
  ],
  commonMistakes: [
    "Esfoliar todos os dias",
    "Usar esfoliante físico agressivo",
    "Combinar com retinol na mesma noite"
  ]
};

const hidratanteNoturno: RoutineStep = {
  id: "hidratante-noturno",
  name: "Hidratante Noturno",
  description: "Use um creme reparador para a noite",
  icon: "🌙",
  whatIs: "O creme noturno é mais nutritivo e ajuda a reparar a pele durante o sono, quando a regeneração celular é mais ativa.",
  whyImportant: "Durante a noite, a pele absorve melhor os nutrientes. Um bom creme noturno potencializa a recuperação.",
  howTo: [
    "Aplique como último passo da rotina noturna",
    "Use quantidade generosa",
    "Massageie suavemente até absorver",
    "Inclua o pescoço"
  ],
  commonMistakes: [
    "Usar o mesmo hidratante do dia à noite",
    "Pular esse passo achando que já hidratou de dia"
  ]
};

// ---- Routines by Goal ----

const routinesByGoal: Record<SkinGoal, { morning: RoutineStep[]; night: RoutineStep[]; specialMorning?: RoutineStep[]; specialNight?: RoutineStep[] }> = {
  acne: {
    morning: [limpezaBasica, serumAntiAcne, hidratante, protetor],
    night: [limpezaBasica, serumAntiAcne, hidratanteNoturno],
    specialNight: [limpezaBasica, esfoliacao, serumAntiAcne, hidratanteNoturno],
  },
  hidratacao: {
    morning: [limpezaBasica, serumHidratante, hidratante, protetor],
    night: [limpezaBasica, serumHidratante, hidratanteNoturno],
    specialMorning: [limpezaBasica, serumHidratante, hidratante, protetor],
    specialNight: [limpezaBasica, esfoliacao, serumHidratante, hidratanteNoturno],
  },
  glow: {
    morning: [limpezaBasica, vitamina_c, hidratante, protetor],
    night: [limpezaBasica, hidratanteNoturno],
    specialNight: [limpezaBasica, esfoliacao, hidratanteNoturno],
  },
  "anti-idade": {
    morning: [limpezaBasica, vitamina_c, hidratante, protetor],
    night: [limpezaBasica, retinol, hidratanteNoturno],
    specialNight: [limpezaBasica, esfoliacao, hidratanteNoturno],
  },
};

const sundayMessages = [
  "Hoje é dia de cuidar de você com calma. Sem pressa. 🌿",
  "Domingo é dia de autocuidado. Vá com carinho. 💕",
  "Respire fundo. Hoje a rotina é sobre você e mais nada. 🌸",
];

export function getDayRoutine(goal: SkinGoal, dayOfWeek: DayOfWeek): DayRoutine {
  const base = routinesByGoal[goal];
  const isSunday = dayOfWeek === 0;
  const isSpecialDay = dayOfWeek === 3 || isSunday; // Wednesday + Sunday

  if (isSunday) {
    return {
      morning: base.morning,
      night: base.specialNight || base.night,
      isSpecial: true,
      specialMessage: sundayMessages[Math.floor(Math.random() * sundayMessages.length)],
    };
  }

  if (isSpecialDay) {
    return {
      morning: base.specialMorning || base.morning,
      night: base.specialNight || base.night,
      isSpecial: true,
      specialMessage: "Hoje tem um cuidado especial na sua rotina! ✨",
    };
  }

  return {
    morning: base.morning,
    night: base.night,
    isSpecial: false,
  };
}

export function getRoutine(skinType: SkinType, goal: SkinGoal): Routine {
  const base = routinesByGoal[goal];
  return { morning: base.morning, night: base.night };
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

export const skinTypeDescriptions: Record<SkinType, string> = {
  oleosa: "Pele com brilho excessivo, poros visíveis e tendência a espinhas",
  seca: "Pele que repuxa, descama ou parece sem vida e sem brilho",
  mista: "Zona T oleosa (testa, nariz, queixo) e bochechas secas",
  normal: "Pele equilibrada, sem excesso de oleosidade nem ressecamento",
};

// ---- Progress helpers ----

export interface WeekProgress {
  [dayIndex: number]: { morning: boolean; night: boolean };
}

export function getWeekKey(): string {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  return `week_${startOfWeek.toISOString().split("T")[0]}`;
}

export function loadProgress(): WeekProgress {
  const key = getWeekKey();
  const stored = localStorage.getItem(`glowapp_progress_${key}`);
  return stored ? JSON.parse(stored) : {};
}

export function saveProgress(progress: WeekProgress) {
  const key = getWeekKey();
  localStorage.setItem(`glowapp_progress_${key}`, JSON.stringify(progress));
}

export function markRoutineDone(dayIndex: number, period: "morning" | "night") {
  const progress = loadProgress();
  if (!progress[dayIndex]) progress[dayIndex] = { morning: false, night: false };
  progress[dayIndex][period] = true;
  saveProgress(progress);
  return progress;
}

export function getStreak(): number {
  const progress = loadProgress();
  const today = new Date().getDay();
  let streak = 0;
  for (let i = today; i >= 0; i--) {
    if (progress[i]?.morning || progress[i]?.night) {
      streak++;
    } else if (i < today) {
      break;
    }
  }
  return streak;
}

export function getWeekCompletionPercent(): number {
  const progress = loadProgress();
  let completed = 0;
  const today = new Date().getDay();
  for (let i = 0; i <= today; i++) {
    if (progress[i]?.morning) completed++;
    if (progress[i]?.night) completed++;
  }
  const total = (today + 1) * 2;
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

export const welcomePhrases = [
  "Sua pele agradece cada dia de cuidado 🌸",
  "Mais um dia para brilhar por dentro e por fora ✨",
  "Cada passo conta. Você está no caminho certo 💕",
  "Glow não é sorte. É rotina 🌟",
  "Hoje é um ótimo dia para cuidar de você 💧",
  "Sua rotina, seu momento. Aproveite 🧴",
];
