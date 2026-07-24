/**
 * JobMatch Pro — Cloudflare Worker receptor de webhooks de PayPal
 *
 * Por qué existe este Worker separado del de matching (worker.js):
 * PayPal firma cada webhook con headers HTTP (paypal-transmission-sig, etc.)
 * que Google Apps Script NO puede leer (doPost(e) no expone headers de la
 * petición). Cloudflare Workers sí puede leerlos completos, así que aquí
 * se hace la verificación real de que el webhook viene de PayPal, y solo
 * si es válido, se le avisa a Apps Script qué plan activar.
 *
 * INSTRUCCIONES DE DESPLIEGUE: ver docs/SETUP-GUIDE.md
 *
 * Variables de entorno necesarias (Settings > Variables and Secrets):
 *   PAYPAL_CLIENT_ID       (de tu app REST en developer.paypal.com)
 *   PAYPAL_CLIENT_SECRET   (de la misma app — marca Encrypt)
 *   PAYPAL_WEBHOOK_ID      (lo genera PayPal al crear el webhook, paso 2 de la guía)
 *   APPS_SCRIPT_URL        (la misma URL de tu Web App de Apps Script)
 *   WEBHOOK_SHARED_SECRET  (una contraseña larga inventada por ti — Encrypt)
 */

const PLAN_ID_TO_NAME = {
  'P-85J178568B772993JNJN5PGI': 'Starter',
  'P-3LD64246BP613823WNJN5WGI': 'Pro',
  'P-2DN85278YV0277106NJN5X3Q': 'Business',
  'P-5XY460257T1232402NJN53IY': 'A la medida',
};

const EVENTS_THAT_ACTIVATE = ['BILLING.SUBSCRIPTION.ACTIVATED', 'BILLING.SUBSCRIPTION.RE-ACTIVATED'];
const EVENTS_THAT_DOWNGRADE = ['BILLING.SUBSCRIPTION.CANCELLED', 'BILLING.SUBSCRIPTION.EXPIRED', 'BILLING.SUBSCRIPTION.SUSPENDED'];

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const rawBody = await request.text();
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (e) {
      return new Response('Invalid JSON', { status: 400 });
    }

    // 1. Verificar con PayPal que este webhook de verdad viene de ellos
    const verified = await verifyPayPalSignature(request, rawBody, env);
    if (!verified) {
      return new Response('Firma inválida — se ignora el evento', { status: 400 });
    }

    // 2. Solo actuamos sobre eventos de activación/baja de suscripciones
    const type = event.event_type;
    const resource = event.resource || {};
    const companyToken = resource.custom_id; // lo mandamos nosotros al crear la suscripción
    const planFromId = PLAN_ID_TO_NAME[resource.plan_id];

    let newPlan = null;
    if (EVENTS_THAT_ACTIVATE.includes(type) && companyToken && planFromId) {
      newPlan = planFromId;
    } else if (EVENTS_THAT_DOWNGRADE.includes(type) && companyToken) {
      newPlan = 'Gratis';
    }

    if (!newPlan) {
      // Evento que no nos interesa (ej. PAYMENT.SALE.COMPLETED individual) — se ignora sin error
      return new Response('Evento recibido, sin acción necesaria', { status: 200 });
    }

    // 3. Avisar a Apps Script que actualice el plan de esa empresa
    const asRes = await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'paypalWebhookConfirmed',
        secret: env.WEBHOOK_SHARED_SECRET,
        companyToken,
        plan: newPlan,
        subscriptionId: resource.id || '',
        eventType: type,
      }).toString(),
    });

    if (!asRes.ok) {
      return new Response('Verificado pero falló al avisar a Apps Script', { status: 502 });
    }

    return new Response('OK', { status: 200 });
  },
};

async function verifyPayPalSignature(request, rawBody, env) {
  const transmissionId = request.headers.get('paypal-transmission-id');
  const transmissionTime = request.headers.get('paypal-transmission-time');
  const certUrl = request.headers.get('paypal-cert-url');
  const authAlgo = request.headers.get('paypal-auth-algo');
  const transmissionSig = request.headers.get('paypal-transmission-sig');

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return false; // no trae los headers de PayPal — no es un webhook real
  }

  // Pide un token de acceso a PayPal (client_credentials)
  const authRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!authRes.ok) return false;
  const { access_token } = await authRes.json();

  // Le pide a PayPal que verifique la firma por nosotros (más simple y
  // confiable que reimplementar la verificación criptográfica a mano)
  const verifyRes = await fetch('https://api-m.paypal.com/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      cert_url: certUrl,
      auth_algo: authAlgo,
      transmission_sig: transmissionSig,
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(rawBody),
    }),
  });
  if (!verifyRes.ok) return false;
  const verifyData = await verifyRes.json();
  return verifyData.verification_status === 'SUCCESS';
}
