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
  | "movies_save"
  | "curio_friends"
  | "curio_comment"
  | "curio_challenge"
  | "curio_viral"
  | "curio_favorites"
  | "real_friends"
  | "real_comment"
  | "real_curiosity"
  | "real_viral"
  | "real_favorites";

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
  { value: "curio_favorites",   label: "Curiosidades • ⭐ Favoritos",       hint: "Os CTAs mais usados" },
  { value: "curio_friends",     label: "Curiosidades • Enviar para amigos", hint: "CTAs de compartilhamento" },
  { value: "curio_comment",     label: "Curiosidades • Comentários",        hint: "CTAs de comentário" },
  { value: "curio_challenge",   label: "Curiosidades • Desafio",            hint: "CTAs de desafio" },
  { value: "curio_viral",       label: "Curiosidades • Viral Shorts/Reels", hint: "Ganchos virais" },
  { value: "real_favorites",    label: "Histórias Reais • ⭐ Favoritos",       hint: "Os CTAs mais usados" },
  { value: "real_friends",      label: "Histórias Reais • Enviar para amigos", hint: "CTAs de compartilhamento" },
  { value: "real_comment",      label: "Histórias Reais • Comentários",        hint: "CTAs de comentário" },
  { value: "real_curiosity",    label: "Histórias Reais • Curiosidade",        hint: "Ganchos de curiosidade" },
  { value: "real_viral",        label: "Histórias Reais • Viral Shorts/Reels", hint: "Ganchos virais" },
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
  bio_cinema: mk("bcin", [
    "🍿 Quer saber onde assistir? Confira a bio.",
    "🎬 Onde assistir completo? Está na bio.",
    "👀 Descubra onde assistir esse filme na bio.",
    "📺 O nome e onde assistir estão na bio.",
    "🔥 Esse filme está disponível? Veja a bio.",
    "🎥 Quer assistir agora? Confira a bio.",
    "🍿 O pessoal sempre pergunta onde assistir… está na bio.",
    "😳 Esse vale muito a pena. Veja a bio.",
    "🎞️ Quer conhecer mais filmes assim? Confira a bio.",
    "🎬 Se esse vídeo apareceu para você, vale conferir a bio.",
  ]),
  bio_jogos: mk("bjog", [
    "🎮 Quer conhecer o jogo que todo mundo está comentando? Confira a bio.",
    "👀 Descubra por que tanta gente está falando desse jogo. Bio.",
    "🔥 Tem um jogo que está chamando muita atenção… veja a bio.",
    "😳 Você provavelmente ainda não conhece esse jogo. Confira a bio.",
    "🎯 Se gosta de desafios, dá uma olhada na bio.",
    "🚀 Quer experimentar algo diferente? Confira a bio.",
    "🕹️ Muita gente está descobrindo esse jogo agora. Veja a bio.",
    "🤔 Será que você conseguiria jogar? Confira a bio.",
    "🎲 Tem novidade para quem gosta de desafios. Bio.",
    "🔥 Quem entende, já sabe do que estou falando. Confira a bio.",
  ]),
  bio_produtos: mk("bprod", [
    "👀 Tem muita gente perguntando onde encontrar esse produto.",
    "🔥 Esse produto está chamando muita atenção.",
    "✨ Achei esse produto e precisei compartilhar.",
    "💡 Esse pode ser um daqueles produtos que facilitam bastante o dia a dia.",
    "🤔 Muita gente ainda não conhece esse achado.",
    "💬 Se quiser saber qual é esse produto, comenta aí.",
    "😅 Depois que descobri esse produto fiquei pensando como não conhecia antes.",
    "🚀 Esse produto está aparecendo para muita gente ultimamente.",
    "👀 Você teria esse produto?",
    "😳 Confesso que não esperava que isso existisse.",
    "📦 Mais um achadinho interessante.",
    "✨ Esse é um daqueles produtos que quase ninguém conhece.",
    "👀 Vale a pena conhecer esse produto.",
    "😅 Muita gente já perguntou onde encontrar.",
    "💬 Quem já conhece esse produto sabe do que estou falando.",
    "🛍️ Esse é o tipo de produto que surpreende.",
    "🤯 Não imaginei que um produto assim existisse.",
    "⭐ Esse achado merece atenção.",
    "📢 Esse produto está dando o que falar.",
    "👀 Aposto que você ficou curioso para saber qual é.",
  ]),
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
  curio_favorites: mk("cufav", [
    "🥇 Marca alguém que precisa descobrir isso 👀",
    "🥈 Duvido seu amigo saber dessa... manda pra ele 🤯",
    "🥉 Você sabia ou descobriu agora? Comenta 👇",
  ]),
  curio_friends: mk("cufr", [
    "👀 Envia para aquele amigo que não sabia disso",
    "📲 Marca alguém que precisa descobrir isso",
    "🤯 Manda para aquele amigo que vai duvidar dessa curiosidade",
    "🔥 Compartilha com alguém que ama aprender coisas novas",
    "😳 Envia para uma pessoa que precisa ver isso hoje",
    "🧠 Marca aquele amigo inteligente pra ver se ele sabia",
    "📢 Duvido seu amigo saber dessa... manda pra ele",
  ]),
  curio_comment: mk("cucm", [
    "🤔 Você já sabia dessa curiosidade?",
    "👀 Você fazia ideia disso?",
    "😱 Qual dessas curiosidades mais te surpreendeu?",
    "🧠 Você sabia ou descobriu agora?",
    "🔥 Comenta se essa informação te surpreendeu",
    "⚡ De 0 a 10, quanto você sabia disso?",
    "👀 Você percebeu esse detalhe?",
  ]),
  curio_challenge: mk("cuch", [
    "🚨 Duvido você acertar antes do final",
    "🧠 Só quem presta atenção vai descobrir",
    "👀 Você consegue explicar isso?",
    "🔥 Poucas pessoas sabem dessa informação",
    "🤯 Aposto que você nunca ouviu isso antes",
    "⚠️ Espera até o final porque isso muda tudo",
  ]),
  curio_viral: mk("cuvr", [
    "😳 Salva esse vídeo porque você vai querer lembrar disso",
    "📌 Guarda essa curiosidade para contar depois",
    "🤯 Essa informação parece mentira, mas é real",
    "👀 O mundo é mais estranho do que você imagina",
    "🔥 Depois dessa você nunca mais vai olhar igual",
  ]),
  real_favorites: mk("hrfav", [
    "🥇 Envia para aquele amigo que precisa ver essa história 🚨",
    "🥈 Você imaginaria que isso aconteceria? 👀",
    "🥉 Marca alguém que precisa conhecer essa história 🔥",
  ]),
  real_friends: mk("hrfr", [
    "🚨 Envia para aquele amigo que precisa ver essa história",
    "👀 Marca alguém que jamais imaginaria isso acontecendo",
    "📲 Compartilha com alguém que gosta de histórias reais",
    "😳 Manda para alguém que não acreditaria nisso",
  ]),
  real_comment: mk("hrcm", [
    "🤔 Você imaginaria que isso aconteceria?",
    "👀 O que você faria nessa situação?",
    "🔥 Você acredita que isso aconteceu de verdade?",
    "🗣️ Conta aí: qual seria sua reação?",
  ]),
  real_curiosity: mk("hrcu", [
    "🚨 Poucos esperavam esse final...",
    "👀 Você já viu algo parecido acontecer?",
    "🔥 Essa história merece ser compartilhada",
    "⚠️ A realidade sempre surpreende",
  ]),
  real_viral: mk("hrvr", [
    "😱 Espera até o final dessa história",
    "👀 O detalhe que poucos perceberam",
    "🔥 Você não vai acreditar no que aconteceu",
    "📌 Salva essa história para lembrar depois",
  ]),
};
