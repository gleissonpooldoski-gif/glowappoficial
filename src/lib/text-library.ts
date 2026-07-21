export type TextPresetCategory =
  | "cta_comment"
  | "cta_follow"
  | "cta_share"
  | "cta_save"
  | "curiosity"
  | "impact"
  | "movies_series"
  | "audience_question"
  | "bio_cinema"
  | "bio_jogos"
  | "bio_produtos"
  | "memes_comment"
  | "memes_share"
  | "memes_follow"
  | "memes_save"
  | "movies_comment"
  | "movies_curiosities"
  | "movies_share"
  | "movies_follow"
  | "movies_save";

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
  { value: "bio_cinema",        label: "🎬 Cinema (BIO)",       hint: "CTAs direcionando para a bio — cinema" },
  { value: "bio_jogos",         label: "🎮 Jogos (BIO)",        hint: "CTAs direcionando para a bio — jogos" },
  { value: "bio_produtos",      label: "🛍️ Produtos (BIO)",     hint: "CTAs direcionando para a bio — produtos" },
  { value: "memes_comment",     label: "Memes • Comentários",  hint: "CTAs de comentário para memes" },
  { value: "memes_share",       label: "Memes • Compartilhar", hint: "CTAs de compartilhamento para memes" },
  { value: "memes_follow",      label: "Memes • Seguir",       hint: "CTAs de seguir para memes" },
  { value: "memes_save",        label: "Memes • Salvar",       hint: "CTAs de salvar para memes" },
  { value: "movies_comment",    label: "Filmes • Comentários", hint: "CTAs de comentário para filmes" },
  { value: "movies_curiosities",label: "Filmes • Curiosidades", hint: "Curiosidades sobre filmes" },
  { value: "movies_share",      label: "Filmes • Compartilhar", hint: "CTAs de compartilhamento para filmes" },
  { value: "movies_follow",     label: "Filmes • Seguir",      hint: "CTAs de seguir para filmes" },
  { value: "movies_save",       label: "Filmes • Salvar",      hint: "CTAs de salvar para filmes" },
];

const mk = (prefix: string, texts: string[]): TextPreset[] =>
  texts.map((text, i) => ({ id: `${prefix}${i + 1}`, text, weight: 700 }));

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
  memes_comment: mk("mc", [
    "👇 Qual sua nota de 0 a 10?",
    "😂 Você faria o mesmo?",
    "🤔 Concorda ou discorda?",
    "👇 Comenta aí!",
    "💬 Quero saber sua opinião!",
    "😅 Quem nunca?",
    "🤣 Isso aconteceu com você?",
    "👀 O que você faria nessa situação?",
    "🔥 Verdade ou mentira?",
    "😳 Você teria essa coragem?",
    "😂 Eu ri mais do que deveria.",
    "🤣 Só eu achei isso engraçado?",
    "👀 O final me pegou de surpresa.",
    "😅 Isso acontece com você também?",
    "🤯 Ninguém esperava por essa.",
    "💀 Eu não tankei.",
    "😂 Defina isso em uma palavra.",
    "🤣 Quem faria pior?",
    "😭 Eu passei mal de rir.",
    "😂 Isso merece um Oscar.",
    "🤣 O brasileiro não tem limites.",
    "💀 Esse vídeo acabou comigo.",
    "😂 Eu não estava preparado.",
    "🤣 Isso foi genial.",
    "👀 Quem também faria isso?",
  ]),
  memes_share: mk("ms", [
    "📤 Envie para aquele amigo!",
    "😂 Marque quem faz isso!",
    "🤣 Compartilhe com quem vai rir!",
    "👀 Manda para seu grupo!",
    "🔥 Esse merece um compartilhamento!",
    "📲 Seu amigo precisa ver isso!",
    "😂 Marca o rei da zoeira.",
    "🤣 Compartilha antes que apaguem.",
    "👇 Marca aquela pessoa agora.",
    "🔥 Esse vídeo merece viralizar.",
    "😂 Marca quem faria igual.",
    "🤣 Seu grupo precisa ver isso.",
    "📤 Compartilhe antes que suma.",
  ]),
  memes_follow: mk("mf", [
    "🔥 Siga @SessaoDaResenha para mais memes!",
    "😂 Curtiu? Então segue a página!",
    "🚀 Tem meme novo todos os dias!",
    "👇 Não perca os próximos vídeos!",
    "🤣 Aqui o humor não para!",
    "😂 Você ainda não segue?",
    "🔥 Vem rir com a gente.",
    "🚀 Ative as notificações.",
    "😂 Todo dia um meme novo.",
    "🤣 Seu feed merece isso.",
  ]),
  memes_save: mk("msv", [
    "📌 Salve para assistir depois!",
    "🔖 Esse vale guardar!",
    "💾 Não esquece de salvar!",
    "👀 Você vai querer rever esse!",
    "💾 Guarda esse meme.",
    "📌 Você vai lembrar desse depois.",
    "😂 Esse merece ficar salvo.",
    "🤣 Vai precisar mostrar para alguém.",
  ]),
  movies_comment: mk("fc", [
    "🎬 Qual a nota desse filme?",
    "🍿 Você já assistiu?",
    "🎥 Assistiria esse filme?",
    "👇 Qual seu personagem favorito?",
    "🔥 Esse filme merece um Oscar?",
    "😱 O final te surpreendeu?",
    "🎬 Você recomendaria esse filme?",
    "👀 Você percebeu esse detalhe?",
    "🤔 Qual cena foi a melhor?",
    "🍿 Vale a pena assistir?",
    "🎭 Quem foi o melhor personagem?",
    "🎬 Esse filme é superestimado?",
    "🔥 Clássico ou comum?",
    "😍 Qual sua cena favorita?",
    "😳 Você teria coragem de assistir sozinho?",
    "🤯 Você esperava esse final?",
    "🎬 Qual filme parece com esse?",
    "🍿 Qual nota você daria?",
    "🎥 Você assistiria novamente?",
    "🎬 Esse filme merece uma continuação?",
    "🍿 Entraria para sua lista de favoritos?",
    "👇 Qual cena mais marcou você?",
    "😱 Esse final foi perfeito?",
    "🎥 Você mudaria alguma coisa nesse filme?",
  ]),
  movies_curiosities: mk("fcu", [
    "🤯 Você sabia dessa curiosidade?",
    "🎬 Esse detalhe passou despercebido.",
    "👀 Pouca gente percebeu isso.",
    "🎥 Você notou esse erro?",
    "🍿 Curiosidade que quase ninguém conhece.",
    "🔥 Esse bastidor é incrível.",
    "🎭 Você sabia disso sobre o elenco?",
    "🎬 Essa cena quase foi diferente.",
    "🎥 Esse ator quase perdeu esse papel.",
    "🍿 Essa cena levou dias para ser gravada.",
    "🎬 O diretor escondeu esse detalhe.",
    "🤯 Quase ninguém percebe isso na primeira vez.",
    "🎥 Existe uma referência escondida nessa cena.",
    "🎭 Esse personagem quase foi interpretado por outro ator.",
    "🍿 Esse final era completamente diferente.",
    "🎬 Essa cena foi improvisada.",
    "👀 Você conseguiu perceber esse easter egg?",
    "🔥 Esse detalhe muda toda a história.",
    "🎥 Você conhecia esse segredo?",
    "🍿 Esse filme tem uma referência escondida.",
    "🎬 Esse detalhe aparece desde o início.",
    "🤯 Essa cena tem um significado oculto.",
  ]),
  movies_share: mk("fs", [
    "📤 Envie para quem ama filmes.",
    "🍿 Marque seu parceiro de maratona.",
    "🎬 Compartilhe com um cinéfilo.",
    "🎥 Esse vídeo merece um compartilhamento.",
    "👀 Quem precisa assistir esse filme?",
    "🔥 Marca aquele amigo que ama cinema.",
    "🍿 Seu amigo vai gostar dessa indicação.",
    "🎬 Compartilhe com quem nunca viu esse filme.",
    "🍿 Esse filme merece mais reconhecimento.",
    "🎥 Marque alguém que assistiria com você.",
    "📤 Esse filme merece ser compartilhado.",
  ]),
  movies_follow: mk("ff", [
    "🎬 Siga para mais recomendações.",
    "🍿 Filmes novos todos os dias.",
    "🎥 Descubra seu próximo filme favorito.",
    "🚀 Siga para não perder nenhuma indicação.",
    "🎬 Aqui só tem filmes incríveis.",
    "⭐ Todo dia uma nova recomendação.",
    "🎭 Mais cinema no seu feed.",
    "🍿 Seu próximo filme favorito pode estar aqui.",
    "🎥 Siga para descobrir filmes escondidos.",
    "🔥 Recomendações diárias para quem ama cinema.",
    "🎬 Filmes que valem seu tempo.",
  ]),
  movies_save: mk("fsv", [
    "📌 Salve para assistir depois.",
    "🍿 Coloque esse na sua lista.",
    "💾 Não esqueça desse filme.",
    "🎬 Esse merece entrar na sua watchlist.",
    "⭐ Você vai agradecer depois.",
    "🎥 Guarde essa recomendação.",
    "📌 Salve para sua próxima maratona.",
    "🍿 Você vai querer assistir esse fim de semana.",
    "🎬 Não perca essa indicação.",
    "💾 Esse filme merece um lugar na sua lista.",
    "🍿 Vale a pena salvar essa recomendação.",
  ]),
};
