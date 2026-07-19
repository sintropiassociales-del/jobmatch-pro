/**
 * JobMatch Pro — Cloudflare Worker de matching por IA
 * Mismo patrón que tu proxy hidden-frog-3123: el frontend nunca ve la
 * API key de OpenAI, el Worker la guarda como variable de entorno secreta.
 *
 * INSTRUCCIONES DE DESPLIEGUE: ver docs/SETUP-GUIDE.md
 *
 * Variable de entorno necesaria (Settings > Variables > Encrypt):
 *   OPENAI_API_KEY
 */

export default {
  async fetch(request, env) {
    // Responder preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Método no permitido' }, 405);
    }

    try {
      const { cvText, jobDescription } = await request.json();

      if (!cvText || !jobDescription) {
        return jsonResponse({ error: 'Falta cvText o jobDescription' }, 400);
      }

      const prompt = `Eres un evaluador de afinidad laboral objetivo y estricto. Compara el perfil de un candidato contra la descripción de una vacante y responde ÚNICAMENTE con un JSON válido, sin texto adicional, con este formato exacto:
{"score": <número entero 0-100>, "reasoning": "<explicación breve en español, máximo 2 frases, mencionando fortalezas y brechas concretas>"}

PERFIL DEL CANDIDATO:
${cvText}

DESCRIPCIÓN DE LA VACANTE:
${jobDescription}`;

      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
      });

      if (!openaiRes.ok) {
        const errText = await openaiRes.text();
        return jsonResponse({ error: 'Error de OpenAI: ' + errText }, 502);
      }

      const data = await openaiRes.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);

      return jsonResponse({
        score: Math.max(0, Math.min(100, parseInt(parsed.score, 10) || 0)),
        reasoning: parsed.reasoning || '',
      });
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
