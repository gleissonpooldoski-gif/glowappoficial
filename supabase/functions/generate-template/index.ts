import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SYSTEM_PROMPT = `Você é um diretor de arte especialista em vídeos verticais virais (9:16, 1080x1920) para redes sociais.

Sua tarefa: gerar um TEMPLATE de vídeo PERSONALIZADO para o nicho informado.

Retorne APENAS um objeto JSON válido (sem markdown, sem comentários) com esta estrutura EXATA:

{
  "name": "Nome curto do template",
  "description": "Descrição de 1 linha",
  "canvas": { "width": 1080, "height": 1920, "background": "#hexcolor" },
  "elements": [
    {
      "id": "unique-string",
      "type": "text" | "shape" | "caption" | "logo" | "image" | "video",
      "x": number, "y": number, "w": number, "h": number,
      "rotation": 0, "zIndex": number, "opacity": number (0-1),
      // text/caption:
      "text": "string",
      "fontFamily": "Inter" | "Montserrat" | "Poppins" | "Bebas Neue" | "Anton" | "Oswald" | "Playfair Display" | "Roboto",
      "fontSize": number, "fontWeight": 400-900,
      "color": "#hex", "align": "left"|"center"|"right",
      "letterSpacing": number, "shadow": boolean,
      "animation": "none"|"fade"|"slide"|"pop",
      // shape:
      "shape": "rect"|"circle", "fill": "#hex", "radius": number,
      // caption:
      "captionStyle": "tiktok"|"viral"|"podcast"|"premium",
      "captionPosition": "top"|"center"|"bottom",
      "highlightColor": "#hex"
    }
  ]
}

REGRAS OBRIGATÓRIAS:
- Canvas SEMPRE 1080x1920.
- Inclua entre 6 e 12 elementos.
- SEMPRE inclua: 1 elemento "video" (fundo, x:0,y:0,w:1080,h:1920,zIndex:0) — placeholder para o vídeo do usuário.
- SEMPRE inclua: 1 elemento "logo" (topo).
- SEMPRE inclua: 1 título principal (text).
- SEMPRE inclua: 1 subtítulo/hook (text).
- SEMPRE inclua: 1 caption (legenda automática) no rodapé.
- SEMPRE inclua: 1 CTA (text com fundo shape).
- SEMPRE inclua: pelo menos 2 formas/elementos gráficos decorativos.
- Coordenadas dentro de 0-1080 (x) e 0-1920 (y).
- Cores devem combinar com o nicho e o estilo pedido.
- Ids únicos (strings curtas tipo "el1", "el2"...).
- NÃO inclua campos "src" (deixe o usuário fazer upload depois).
- Zindex crescente: fundo=0, gráficos=1-3, textos=4-9, cta=10.

Se o usuário pedir refinamento de estilo (ex: "estilo Netflix"), mantenha a mesma ESTRUTURA (mesmos tipos de elementos e proporções) mas ajuste cores, fontes, textos e detalhes.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { niche, stylePrompt, currentTemplate } = await req.json();
    const key = Deno.env.get('LOVABLE_API_KEY');
    if (!key) throw new Error('LOVABLE_API_KEY missing');

    let userMsg = '';
    if (currentTemplate && stylePrompt) {
      userMsg = `Refine este template mantendo os elementos editáveis, aplicando o estilo: "${stylePrompt}".\n\nTemplate atual (JSON):\n${JSON.stringify(currentTemplate)}`;
    } else if (stylePrompt) {
      userMsg = `Nicho: ${niche || 'genérico'}\nEstilo desejado: ${stylePrompt}\n\nGere um novo template.`;
    } else {
      userMsg = `Nicho da página: ${niche}\n\nGere um template viral e profissional para esse nicho.`;
    }

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Lovable-API-Key': key,
      },
      body: JSON.stringify({
        model: 'google/gemini-3.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      return new Response(JSON.stringify({ error: `AI Gateway ${res.status}: ${t}` }), {
        status: res.status === 429 || res.status === 402 ? res.status : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '{}';
    let parsed: any;
    try {
      parsed = typeof content === 'string' ? JSON.parse(content) : content;
    } catch {
      const m = String(content).match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    // Normalize
    const doc = {
      name: parsed.name || `Template ${niche || 'IA'}`,
      description: parsed.description || `Gerado por IA para ${niche || 'seu nicho'}`,
      canvas: {
        width: 1080,
        height: 1920,
        background: parsed.canvas?.background || '#0a0a0a',
      },
      elements: Array.isArray(parsed.elements) ? parsed.elements.map((e: any, i: number) => ({
        id: e.id || `el-${i}-${Math.random().toString(36).slice(2, 7)}`,
        type: e.type || 'text',
        x: Number(e.x) || 0,
        y: Number(e.y) || 0,
        w: Number(e.w) || 200,
        h: Number(e.h) || 100,
        rotation: Number(e.rotation) || 0,
        zIndex: Number(e.zIndex) || i,
        opacity: e.opacity ?? 1,
        ...(e.text !== undefined && { text: e.text }),
        ...(e.fontFamily && { fontFamily: e.fontFamily }),
        ...(e.fontSize && { fontSize: Number(e.fontSize) }),
        ...(e.fontWeight && { fontWeight: Number(e.fontWeight) }),
        ...(e.color && { color: e.color }),
        ...(e.align && { align: e.align }),
        ...(e.letterSpacing !== undefined && { letterSpacing: Number(e.letterSpacing) }),
        ...(e.shadow !== undefined && { shadow: !!e.shadow }),
        ...(e.animation && { animation: e.animation }),
        ...(e.shape && { shape: e.shape }),
        ...(e.fill && { fill: e.fill }),
        ...(e.radius !== undefined && { radius: Number(e.radius) }),
        ...(e.captionStyle && { captionStyle: e.captionStyle }),
        ...(e.captionPosition && { captionPosition: e.captionPosition }),
        ...(e.highlightColor && { highlightColor: e.highlightColor }),
      })) : [],
    };

    return new Response(JSON.stringify(doc), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
