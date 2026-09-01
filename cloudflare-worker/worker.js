/**
 * JobMatch Pro — Cloudflare Worker de matching por IA (usando Google Gemini)
 * El frontend nunca ve la API key: el Worker la guarda como variable de
 * entorno secreta y hace la llamada por ti.
 *
 * Por qué Gemini y no OpenAI: el modelo gemini-3.5-flash-lite tiene una capa
 * gratuita de hasta 1,500 llamadas al día, sin necesidad de tarjeta de
 * crédito — de sobra para el volumen de este proyecto (ver
 * docs/CUANDO-ESCALAR.md). Si algún día superas ese límite, basta con
 * cambiar GEMINI_MODEL a una versión de pago o activar facturación en
 * Google AI Studio; el resto del código no cambia.
 *
 * INSTRUCCIONES DE DESPLIEGUE: ver docs/SETUP-GUIDE.md
 *
 * Variable de entorno necesaria (Settings > Variables and Secrets):
 *   GEMINI_API_KEY   — sácala gratis en https://aistudio.google.com/apikey
 *                      con la misma cuenta de Google que usas para el Sheet.
 */

const GEMINI_MODEL = 'gemini-3.5-flash-lite';

export default {
  async fetch(request, env) {
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
{"score": <número entero 0-100>, "reasoning": "<explicación breve en español, máximo 2 frases, mencionando fortalezas y brechas concretas>", "recomendaciones": "<1-2 frases en español dirigidas al candidato: qué habilidad, conocimiento o experiencia concreta le ayudaría a acercarse más a este puesto específico. Sé constructivo y específico, no genérico. Si el candidato ya encaja muy bien (score alto), puedes decir que no hay brechas relevantes.>"}

PERFIL DEL CANDIDATO:
${cvText}

DESCRIPCIÓN DE LA VACANTE:
${jobDescription}`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        return jsonResponse({ error: 'Error de Gemini: ' + errText }, 502);
      }

      const data = await geminiRes.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const parsed = JSON.parse(content);

      return jsonResponse({
        score: Math.max(0, Math.min(100, parseInt(parsed.score, 10) || 0)),
        reasoning: parsed.reasoning || '',
        recomendaciones: parsed.recomendaciones || '',
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
