export type TextPresetCategory =
  | "cta_comment"
  | "cta_follow"
  | "cta_share"
  | "cta_save"
  | "curiosity"
  | "impact"
  | "movies_series"
  | "audience_question";

export type TextPreset = {
  id: string;
  text: string;
  animation?: "none" | "fade" | "slide-up" | "pulse";
  size?: number;
  weight?: number;
};

export const TEXT_CATEGORIES: { value: TextPresetCategory; label: string; hint: string }[] = [
  { value: "cta_comment",       label: "CTA de comentários",   hint: "Provoque conversa nos comentários" },
  { value: "cta_follow",        label: "CTA de seguidores",    hint: "Incentive novos seguidores" },
  { value: "cta_share",         label: "CTA de compartilhar",  hint: "Faça viralizar" },
  { value: "cta_save",          label: "CTA de salvar",        hint: "Aumente saves e retenção" },
  { value: "curiosity",         label: "Curiosidade",          hint: "Gatilhos de curiosidade" },
  { value: "impact",            label: "Impacto",              hint: "Frases fortes de abertura" },
  { value: "movies_series",     label: "Filmes e séries",      hint: "Ganchos temáticos" },
  { value: "audience_question", label: "Perguntas à audiência", hint: "Interação com a audiência" },
];

export const TEXT_PRESETS: Record<TextPresetCategory, TextPreset[]> = {
  cta_comment: [
    { id: "c1", text: "Comenta 'EU' se concordou 👇", animation: "pulse", weight: 800 },
    { id: "c2", text: "Deixa sua opinião nos comentários", animation: "fade" },
    { id: "c3", text: "Qual parte te surpreendeu? Conta aí 👇" },
    { id: "c4", text: "Concorda? Comenta SIM ou NÃO", weight: 900 },
    { id: "c5", text: "Marca alguém que precisa ver isso" },
  ],
  cta_follow: [
    { id: "f1", text: "Segue para não perder o próximo 🔥", animation: "slide-up", weight: 800 },
    { id: "f2", text: "Me segue por mais conteúdos assim" },
    { id: "f3", text: "Ativa o sininho aqui 🔔" },
    { id: "f4", text: "Vem comigo: @seuperfil", animation: "fade" },
  ],
  cta_share: [
    { id: "s1", text: "Compartilha com quem precisa saber", animation: "fade", weight: 800 },
    { id: "s2", text: "Manda esse vídeo pra alguém 📲" },
    { id: "s3", text: "Envia pro grupo dos amigos 😂" },
    { id: "s4", text: "Repost autorizado 👉 marca a gente" },
  ],
  cta_save: [
    { id: "sv1", text: "Salva antes que esqueça ⭐", animation: "pulse", weight: 800 },
    { id: "sv2", text: "Toca no marcador para salvar 📌" },
    { id: "sv3", text: "Vai precisar depois — SALVA aí" },
  ],
  curiosity: [
    { id: "cu1", text: "Poucos sabem disso…", animation: "fade", weight: 700 },
    { id: "cu2", text: "Ninguém te contou isso antes", animation: "slide-up" },
    { id: "cu3", text: "Espera até o final 👀", animation: "pulse", weight: 800 },
    { id: "cu4", text: "O que acontece a seguir vai te surpreender" },
  ],
  impact: [
    { id: "i1", text: "ISSO MUDA TUDO.", weight: 900, size: 56 },
    { id: "i2", text: "Pare de fazer isso HOJE", weight: 900, animation: "pulse" },
    { id: "i3", text: "3 verdades que ninguém fala", weight: 800 },
    { id: "i4", text: "Se você faz isso, precisa ver", animation: "slide-up" },
  ],
  movies_series: [
    { id: "m1", text: "A cena que ninguém esqueceu", animation: "fade", weight: 800 },
    { id: "m2", text: "Top 5 finais mais chocantes", weight: 900 },
    { id: "m3", text: "Você percebeu esse detalhe?", animation: "pulse" },
    { id: "m4", text: "Easter egg escondido 🥚" },
  ],
  audience_question: [
    { id: "q1", text: "E você, o que faria nesse lugar?", animation: "fade" },
    { id: "q2", text: "Qual sua opinião sincera?", weight: 700 },
    { id: "q3", text: "Time A ou Time B? 👇" },
    { id: "q4", text: "De 0 a 10, quanto você concorda?" },
  ],
};
