export interface Tutorial {
  id: string;
  title: string;
  content: string;
  readTime: string;
}

export interface TutorialCategory {
  id: string;
  title: string;
  description: string;
  icon: string;
  tutorials: Tutorial[];
}

export const tutorialCategories: TutorialCategory[] = [
  {
    id: "limpeza",
    title: "Limpeza Facial Correta",
    description: "Aprenda a limpar o rosto do jeito certo",
    icon: "💧",
    tutorials: [
      {
        id: "limpeza-1",
        title: "Como lavar o rosto corretamente",
        readTime: "2 min",
        content: `**Passo a passo simples:**

1. Molhe o rosto com água morna (nunca quente!)
2. Aplique o limpador nas mãos e faça espuma
3. Massageie o rosto com movimentos circulares por 60 segundos
4. Enxágue bem com água morna
5. Seque com uma toalha limpa, sem esfregar — apenas pressionando

**Dica importante:** Lave o rosto no máximo 2 vezes ao dia. Lavar demais pode irritar a pele e aumentar a oleosidade.`,
      },
      {
        id: "limpeza-2",
        title: "Qual limpador usar para cada tipo de pele",
        readTime: "3 min",
        content: `**Pele oleosa:** Gel de limpeza ou sabonete líquido com ácido salicílico. Evite sabonetes em barra.

**Pele seca:** Leite de limpeza ou espuma suave. Procure fórmulas com ceramidas.

**Pele mista:** Gel de limpeza suave, sem sulfatos agressivos.

**Pele normal:** Qualquer limpador suave funciona bem. Escolha o que for mais confortável.

**Regra de ouro:** Se a pele ficar repuxando após a limpeza, o produto é agressivo demais para você.`,
      },
    ],
  },
  {
    id: "ordem",
    title: "Ordem do Skincare",
    description: "A sequência certa faz toda a diferença",
    icon: "📋",
    tutorials: [
      {
        id: "ordem-1",
        title: "A ordem correta dos produtos",
        readTime: "3 min",
        content: `**Manhã (do mais leve ao mais pesado):**
1. Limpeza facial
2. Tônico (opcional)
3. Sérum (vitamina C, niacinamida, etc.)
4. Hidratante
5. Protetor solar (sempre o último!)

**Noite:**
1. Limpeza facial (dupla limpeza se usou maquiagem)
2. Tônico (opcional)
3. Sérum/Tratamento (retinol, ácidos, etc.)
4. Hidratante ou creme noturno

**Por que a ordem importa?** Produtos mais leves são absorvidos primeiro. Se você aplicar um creme pesado antes de um sérum, o sérum não vai penetrar na pele.`,
      },
      {
        id: "ordem-2",
        title: "Produtos que não podem ser misturados",
        readTime: "2 min",
        content: `**Nunca use juntos:**
- Vitamina C + Retinol (podem irritar)
- Ácido salicílico + Retinol (irritação excessiva)
- Dois ácidos fortes ao mesmo tempo

**Podem ser usados juntos:**
- Ácido hialurônico + qualquer produto
- Niacinamida + Protetor solar
- Vitamina C + Protetor solar (ótima combinação!)

**Dica:** Use vitamina C de manhã e retinol à noite. Assim você aproveita os dois sem irritar a pele.`,
      },
    ],
  },
  {
    id: "erros",
    title: "Erros Comuns",
    description: "Evite esses erros que prejudicam sua pele",
    icon: "⚠️",
    tutorials: [
      {
        id: "erros-1",
        title: "7 erros que estão prejudicando sua pele",
        readTime: "3 min",
        content: `1. **Pular o protetor solar** — O sol é o principal causador de manchas e envelhecimento precoce.

2. **Lavar o rosto com água quente** — A água quente retira a oleosidade natural e resseca.

3. **Usar muitos produtos de uma vez** — Comece com o básico e adicione aos poucos.

4. **Espremer espinhas** — Pode causar cicatrizes permanentes e infecções.

5. **Dormir de maquiagem** — Entope os poros e causa inflamação.

6. **Trocar de produtos toda semana** — Dê pelo menos 4-6 semanas para ver resultados.

7. **Esfoliar demais** — No máximo 2-3 vezes por semana com esfoliantes suaves.`,
      },
    ],
  },
  {
    id: "habitos",
    title: "Hábitos Saudáveis",
    description: "Hábitos simples que transformam sua pele",
    icon: "🌿",
    tutorials: [
      {
        id: "habitos-1",
        title: "5 hábitos que melhoram a pele naturalmente",
        readTime: "2 min",
        content: `1. **Beba água** — Pelo menos 2 litros por dia. A hidratação começa de dentro para fora.

2. **Durma bem** — A pele se repara durante o sono. Tente dormir 7-8 horas por noite.

3. **Troque a fronha** — A cada 2-3 dias. Fronhas acumulam oleosidade e bactérias.

4. **Não toque no rosto** — Suas mãos carregam bactérias que causam espinhas.

5. **Alimente-se bem** — Frutas, verduras e alimentos ricos em vitaminas A, C e E ajudam a pele a ficar mais bonita.`,
      },
    ],
  },
  {
    id: "protecao-solar",
    title: "Proteção Solar",
    description: "O passo mais importante do skincare",
    icon: "☀️",
    tutorials: [
      {
        id: "solar-1",
        title: "Por que o protetor solar é indispensável",
        readTime: "2 min",
        content: `**Fatos importantes:**
- 80% do envelhecimento da pele é causado pelo sol
- Manchas, rugas e flacidez são aceleradas pela exposição solar
- Mesmo em dias nublados, os raios UV atingem a pele

**Como usar corretamente:**
1. Aplique o protetor 15-20 minutos antes de sair
2. Use a quantidade de 3 dedos para o rosto
3. Reaplique a cada 2-3 horas se estiver ao ar livre
4. Use FPS 30 no mínimo (FPS 50 é ideal)

**Mito derrubado:** "Pele negra não precisa de protetor solar" — TODAS as peles precisam de proteção solar.`,
      },
      {
        id: "solar-2",
        title: "Como escolher o protetor solar ideal",
        readTime: "2 min",
        content: `**Pele oleosa:** Protetor em gel ou toque seco, oil-free.

**Pele seca:** Protetor com hidratante, em creme ou loção.

**Pele mista:** Protetor com textura fluida ou sérum.

**Pele sensível:** Protetor mineral (com óxido de zinco ou dióxido de titânio).

**Dicas extras:**
- Protetor com cor funciona como base leve
- Proteja também pescoço e orelhas
- No dia a dia dentro de casa, FPS 30 já é suficiente`,
      },
    ],
  },
  {
    id: "cuidados-basicos",
    title: "Cuidados Básicos Diários",
    description: "O essencial para começar sua rotina",
    icon: "🧴",
    tutorials: [
      {
        id: "basicos-1",
        title: "Os 3 passos essenciais do skincare",
        readTime: "2 min",
        content: `Se você está começando, foque apenas em 3 passos:

**1. Limpar** 🧼
Lave o rosto 2x ao dia com um limpador adequado.

**2. Hidratar** 💧
Mesmo peles oleosas precisam de hidratação! Use um hidratante adequado.

**3. Proteger** ☀️
Protetor solar toda manhã, sem exceção.

**Esse trio básico já faz uma diferença enorme.** Quando se sentir confortável, você pode adicionar um sérum ou tratamento específico.

**Lembre-se:** Consistência é mais importante que quantidade de produtos.`,
      },
      {
        id: "basicos-2",
        title: "Quando esperar resultados",
        readTime: "2 min",
        content: `**Expectativas realistas:**
- **1-2 semanas:** A pele começa a se adaptar aos produtos
- **4-6 semanas:** Você nota melhora na textura e hidratação
- **8-12 semanas:** Resultados visíveis com tratamentos (acne, manchas)
- **3-6 meses:** Mudanças significativas na qualidade da pele

**Importante:**
- Não desista nas primeiras semanas
- Alguns produtos causam uma "piora" inicial (como o retinol)
- Tire fotos para comparar — a mudança é gradual e às vezes não percebemos
- Seja gentil com sua pele e com você!`,
      },
    ],
  },
];
