interface ChatResponse {
  keywords: string[];
  response: string;
}

const responses: ChatResponse[] = [
  {
    keywords: ["protetor", "solar", "fps", "sol"],
    response: "O protetor solar é o passo mais importante do skincare! Use FPS 30 no mínimo, e aplique a quantidade de 3 dedos para o rosto. Reaplique a cada 2-3 horas se estiver ao ar livre. ☀️",
  },
  {
    keywords: ["espinha", "acne", "cravo", "espinhas"],
    response: "Para acne, o mais importante é manter a pele limpa e usar produtos com ácido salicílico. Nunca esprema espinhas — isso pode causar cicatrizes! Se a acne for persistente, procure um dermatologista. 💧",
  },
  {
    keywords: ["hidrat", "seca", "ressecada"],
    response: "A hidratação é essencial para todos os tipos de pele! Use um hidratante adequado ao seu tipo de pele e aplique com a pele ainda úmida para melhor absorção. O ácido hialurônico é ótimo para isso! 🧴",
  },
  {
    keywords: ["retinol", "anti-idade", "ruga", "envelhecimento"],
    response: "O retinol é um dos ingredientes mais eficazes contra sinais de envelhecimento. Comece com concentrações baixas (0,25%), use apenas à noite e sempre use protetor solar pela manhã. Os resultados aparecem em 8-12 semanas! ✨",
  },
  {
    keywords: ["vitamina c", "manchas", "clarea", "ilumina"],
    response: "A Vitamina C é ótima para iluminar a pele e reduzir manchas! Use pela manhã, antes do protetor solar. Guarde o produto em local escuro e fresco para não oxidar. 🍊",
  },
  {
    keywords: ["ordem", "sequência", "primeiro", "antes"],
    response: "A ordem correta é: Limpeza → Tônico → Sérum → Hidratante → Protetor Solar (manhã). À noite, troque o protetor solar por um creme noturno. Sempre do mais leve ao mais pesado! 📋",
  },
  {
    keywords: ["oleosa", "brilho", "oleosidade"],
    response: "Para pele oleosa, use produtos oil-free e gel de limpeza. Não pule a hidratação — pele desidratada produz mais oleosidade! O ácido salicílico e a niacinamida são seus aliados. 💎",
  },
  {
    keywords: ["limpeza", "lavar", "limpar", "sabonete"],
    response: "Lave o rosto 2x ao dia com movimentos circulares por 60 segundos. Use água morna (nunca quente!) e seque com toalha limpa, sem esfregar. Se a pele repuxar depois, o produto é agressivo demais. 💧",
  },
  {
    keywords: ["rotina", "começar", "iniciante", "básico"],
    response: "Comece com o trio básico: Limpar + Hidratar + Proteger (protetor solar). Esse combo já faz uma diferença enorme! Quando se sentir confortável, adicione um sérum. Consistência é mais importante que quantidade de produtos! 🌟",
  },
  {
    keywords: ["oi", "olá", "bom dia", "boa tarde", "boa noite", "hey", "hello"],
    response: "Olá! 🌸 Eu sou a assistente do GlowApp! Posso te ajudar com dúvidas sobre skincare, rotinas de cuidados e dicas para sua pele. O que gostaria de saber?",
  },
];

const defaultResponse = "Boa pergunta! 🌸 Para uma orientação mais específica, recomendo conferir nossos tutoriais na seção de conteúdos. Lá você encontra informações detalhadas sobre limpeza, hidratação, proteção solar e muito mais. Posso te ajudar com algo mais?";

export function getChatResponse(message: string): string {
  const lowerMessage = message.toLowerCase();
  
  for (const r of responses) {
    if (r.keywords.some(kw => lowerMessage.includes(kw))) {
      return r.response;
    }
  }
  
  return defaultResponse;
}
