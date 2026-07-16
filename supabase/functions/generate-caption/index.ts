// Edge function: gera legenda + hashtags para um vídeo pronto usando Lovable AI.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  filename?: string;
  templateName?: string | null;
  projectName?: string | null;
  projectCategory?: string | null;
  videoText?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    const context = [
      body.projectName ? `Projeto/página: ${body.projectName}` : null,
      body.projectCategory ? `Nicho: ${body.projectCategory}` : null,
      body.templateName ? `Template aplicado: ${body.templateName}` : null,
      body.filename ? `Arquivo: ${body.filename}` : null,
      body.videoText ? `Texto no vídeo: ${body.videoText}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const system = `Você é um especialista em copywriting para Instagram Reels e TikTok em português do Brasil.
Sua tarefa é criar UMA legenda curta e atrativa e um conjunto de hashtags relevantes baseado no contexto do vídeo.

Regras da LEGENDA:
- 1 a 3 frases curtas, no máximo ~220 caracteres.
- Gera curiosidade e incentiva interação (comentar, salvar, marcar alguém).
- Tom natural, sem clichês de marketing.
- Adequada ao nicho.
- No máximo 1 emoji, opcional.

Regras das HASHTAGS:
- 12 a 18 hashtags no total.
- Divididas em 3 grupos: "alcance" (grandes/genéricas do nicho), "nicho" (do segmento) e "tema" (específicas do vídeo).
- Sem hashtags aleatórias, banidas ou spam.
- Cada hashtag começa com # e não contém espaço.

Responda SOMENTE em JSON válido no formato:
{"caption":"...", "hashtags":{"alcance":["#..."],"nicho":["#..."],"tema":["#..."]}}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: context || "Vídeo genérico sem contexto adicional." },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("[generate-caption] gateway error", response.status, errText);
      return new Response(JSON.stringify({ error: "Falha ao gerar legenda." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      parsed = { caption: String(raw), hashtags: { alcance: [], nicho: [], tema: [] } };
    }

    const normalizeTag = (t: string) => {
      const s = String(t).trim().replace(/\s+/g, "");
      return s.startsWith("#") ? s : `#${s}`;
    };
    const groups = parsed?.hashtags ?? {};
    const result = {
      caption: String(parsed?.caption ?? "").trim(),
      hashtags: {
        alcance: Array.isArray(groups.alcance) ? groups.alcance.map(normalizeTag) : [],
        nicho: Array.isArray(groups.nicho) ? groups.nicho.map(normalizeTag) : [],
        tema: Array.isArray(groups.tema) ? groups.tema.map(normalizeTag) : [],
      },
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[generate-caption] fatal", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
