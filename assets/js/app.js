/* ==========================================================
   JobMatch Pro (versión ligera) — configuración y helpers
   ========================================================== */

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz-PlmaDw5_8NbBawOkz0E5K8lQ-9EPz4-BRBY29GaIHTH9sTlhhobJFIqR8rndnTd5/exec";
const CF_WORKER_URL = "jobmatch-ai-matching.coordinador1-ce.workers.dev";
// Worker de caché para picos de tráfico (ver cloudflare-worker/cache-proxy-worker.js
// y docs/SETUP-GUIDE.md sección 3.1). Mientras esto quede vacío, listJobs y
// getJob siguen yendo directo a Apps Script como antes — no rompe nada si
// todavía no desplegaste este Worker. Rellena con tu URL cuando lo hagas,
// ej: "https://jobmatch-cache.tu-usuario.workers.dev"
const CF_CACHE_WORKER_URL = "jobmatch-cache.coordinador1-ce.workers.dev";
const GOOGLE_CLIENT_ID = "1048097062338-9dj7eluj20ie8721vt5rfdgi1djk7ihj.apps.googleusercontent.com";
const LINKEDIN_CLIENT_ID = "78058rf4ovum4p"; // opcional — solo si activaste "Entrar con LinkedIn"
const CF_LINKEDIN_WORKER_URL = "https://jobmatch-linkedin-auth.coordinador1-ce.workers.dev"; // opcional, ver docs/SETUP-GUIDE.md

const COMPANY_TOKEN_KEY = 'jobmatch_company_token';
const CANDIDATE_TOKEN_KEY = 'jobmatch_candidate_token';
// Misma llave que usa admin-plataforma.html (ahí definida como
// ADMIN_KEY_STORAGE) — una vez que inicias sesión de administrador ahí,
// esta llave queda guardada y las demás páginas del sitio la pueden leer
// para reconocer que tienes sesión de administrador activa, sin tener que
// volver a escribir la clave en cada una.
const ADMIN_SESSION_KEY = 'jobmatch_admin_session';
function getAdminSessionKey() {
  try { return localStorage.getItem(ADMIN_SESSION_KEY) || null; } catch (e) { return null; }
}

/* ---------- Caché ligera de la sesión de empresa ----------
   Guarda solo lo mínimo (nombre y plan) para poder mostrar el panel/tarjeta
   de sesión al instante en la siguiente visita, mientras se confirma en
   segundo plano con Apps Script — evita la pantalla en blanco/"Verificando
   tu sesión..." mientras Apps Script hace su arranque en frío. */
const COMPANY_CACHE_KEY = 'jobmatch_company_cache';
function cacheEmpresaSession(data) {
  try { localStorage.setItem(COMPANY_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
}
function getCachedEmpresaSession() {
  try { return JSON.parse(localStorage.getItem(COMPANY_CACHE_KEY) || 'null'); } catch (e) { return null; }
}
function clearCachedEmpresaSession() {
  try { localStorage.removeItem(COMPANY_CACHE_KEY); } catch (e) {}
}

/* ---------- Caché ligera de la sesión de candidato ----------
   Mismo motivo que la de empresa arriba: candidatos.html necesita mostrar la
   tarjeta "Hola, <nombre>" al instante (no unos segundos después) cuando ya
   hay sesión de candidato — sin esto, la tarjeta se queda vacía/oculta
   mientras se confirma con Apps Script, que puede tardar varios segundos en
   un arranque en frío. */
const CANDIDATE_CACHE_KEY = 'jobmatch_candidate_cache';
function cacheCandidateSession(data) {
  try { localStorage.setItem(CANDIDATE_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
}
function getCachedCandidateSession() {
  try { return JSON.parse(localStorage.getItem(CANDIDATE_CACHE_KEY) || 'null'); } catch (e) { return null; }
}
function clearCachedCandidateSession() {
  try { localStorage.removeItem(CANDIDATE_CACHE_KEY); } catch (e) {}
}

/* ---------- Mapa de habilidades y competencias ----------
   Fuente única de verdad para todo el sitio: candidato.html lo usa para
   ofrecer opciones prellenadas al armar el perfil (más rápido que escribir
   todo a mano) y candidatos.html lo usa para colorear/agrupar el directorio
   y la vista de mapa. Si agregas o cambias una categoría aquí, se refleja
   en ambos lugares automáticamente.
   "rx" clasifica automáticamente una habilidad de texto libre (aunque no
   esté en la lista de sugeridas) para que el directorio también le ponga
   color a lo que los candidatos escriban por su cuenta. */
const SKILL_MAP = [
  {
    nombre: 'Finanzas y contabilidad', color: '#2E9E5B',
    rx: /excel|contabilidad|finan|\bsat\b|impuest|n[oó]mina|conciliaci|presupuest|reportes financ|factura|cfdi/i,
    skills: ['Excel avanzado', 'Contabilidad general', 'Conciliaciones bancarias', 'Elaboración de presupuestos', 'Nómina', 'Facturación y CFDI', 'Análisis financiero', 'Declaraciones fiscales (SAT)'],
  },
  {
    nombre: 'Tecnología', color: '#2B6FE0',
    rx: /javascript|python|\bsql\b|react|node|programa|desarroll|software|base(s)? de datos|machine learning|\bgit\b|visualizaci[oó]n de datos|soporte t[eé]cnico|ciberseguridad/i,
    skills: ['Python', 'JavaScript', 'SQL y bases de datos', 'Desarrollo web', 'Soporte técnico', 'Ciberseguridad básica', 'Análisis de datos', 'Automatización de procesos'],
  },
  {
    nombre: 'Marketing y ventas', color: '#D6336C',
    rx: /marketing|ventas|\bseo\b|redes sociales|publicidad|contenido|\bads\b|\bcrm\b|copywriting|negociaci/i,
    skills: ['Marketing digital', 'Redes sociales', 'SEO', 'Ventas y negociación', 'Atención a clientes', 'Publicidad en redes (Ads)', 'Gestión de CRM', 'Copywriting'],
  },
  {
    nombre: 'Recursos humanos', color: '#D4A017',
    rx: /reclutamiento|selecci[oó]n|talento|capacitaci|clima laboral|onboarding|desarrollo organiz|entrevistas|prestaciones/i,
    skills: ['Reclutamiento y selección', 'Capacitación', 'Clima laboral', 'Nómina y prestaciones', 'Onboarding', 'Evaluación de desempeño', 'Entrevistas laborales'],
  },
  {
    nombre: 'Logística y operaciones', color: '#B85C00',
    rx: /log[ií]stica|inventario|cadena de suministro|proveedor|operaciones|almac[eé]n|compras/i,
    skills: ['Gestión de inventarios', 'Cadena de suministro', 'Logística y distribución', 'Manejo de almacén', 'Control de calidad', 'Compras y proveedores'],
  },
  {
    nombre: 'Legal y administrativo', color: '#546E7A',
    rx: /legal|contrato|jur[ií]dic|administrativ|normativ|cumplimiento/i,
    skills: ['Redacción de contratos', 'Derecho laboral', 'Trámites administrativos', 'Cumplimiento normativo', 'Atención a proveedores'],
  },
  {
    nombre: 'Salud', color: '#0F9B8E',
    rx: /salud|enfermer[ií]a|m[eé]dic|paciente|primeros auxilios/i,
    skills: ['Atención a pacientes', 'Primeros auxilios', 'Enfermería general', 'Trabajo en consultorio', 'Farmacovigilancia básica'],
  },
];
const SKILL_CATEGORIA_GENERAL = {
  nombre: 'Habilidades generales', color: '#FF6B1A',
  skills: ['Trabajo en equipo', 'Comunicación efectiva', 'Resolución de problemas', 'Liderazgo', 'Organización y gestión del tiempo', 'Manejo de Office', 'Inglés'],
};
// Clasifica una habilidad de texto libre en una categoría del mapa (o en
// "Habilidades generales" si no coincide con ninguna) — se usa para
// colorear el directorio de candidatos.
function categorizarHabilidad(skill) {
  return SKILL_MAP.find((cat) => cat.rx.test(skill)) || SKILL_CATEGORIA_GENERAL;
}

/* ---------- Nav que se adapta a la sesión activa ----------
   El menú de arriba es el mismo HTML copiado en todas las páginas. Si hay
   una sesión de empresa abierta en este navegador, "Mi perfil" ya no debe
   mandar al login de candidato (que ofrece entrar con LinkedIn — no tiene
   sentido estando en modo empresa) — mejor manda directo al panel de la
   empresa. "Acceso empresas" se oculta en ese caso porque ya sería
   redundante (llevaría al mismo lugar que "Mi cuenta"). Si NO hay sesión de
   empresa (o solo hay sesión de candidato), el menú se queda igual que
   siempre. */
document.addEventListener('DOMContentLoaded', () => {
  const hasCompanySession = !!localStorage.getItem(COMPANY_TOKEN_KEY);
  if (!hasCompanySession) return;
  document.querySelectorAll('.nav-links a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === 'candidato.html') {
      a.setAttribute('href', 'portal-empresa.html');
      a.textContent = 'Mi cuenta';
    } else if (href === 'registro-empresa.html') {
      // Antes "Publicar vacante" (y el botón "Publicar gratis") mandaban
      // aquí SIEMPRE, incluso con sesión de empresa ya abierta — la persona
      // terminaba en la pantalla de "crear cuenta nueva" (con el atajo de
      // verificar con Google y todo) en vez de ir directo a publicar desde
      // su cuenta real. Ahora, con sesión activa, van directo al panel.
      a.setAttribute('href', 'portal-empresa.html');
      if (a.classList.contains('nav-cta')) a.textContent = 'Ir a mi panel';
    } else if (a.textContent.trim() === 'Acceso empresas') {
      a.style.display = 'none';
    }
  });
});

// Mismo criterio, pero para una sesión de candidato: el link "Precios" no le
// sirve de nada (esa página es para empresas) — en su lugar, para un
// candidato con sesión, apunta a su estudio socioeconómico privado (ver
// precios.html, que muestra un contenido u otro según haya o no sesión de
// candidato). "Publicar vacante" y "Acceso empresas" tampoco le sirven (son
// para empresas), así que se ocultan, y el botón "Publicar gratis" — que no
// tiene sentido para alguien que ya tiene cuenta de candidato — se
// convierte en "Cerrar sesión".
//
// Esto se define como función reutilizable (no solo un listener de
// DOMContentLoaded) porque el login de candidato normalmente pasa DENTRO de
// candidato.html sin recargar la página — si solo corriera en
// DOMContentLoaded, el menú se quedaría con las opciones de "visitante"
// hasta el siguiente cambio de página. candidato.html la vuelve a llamar en
// cuanto el login termina (ver loadProfile()) para que el menú se actualice
// al instante. Es segura de llamar más de una vez (no duplica el botón de
// cerrar sesión ni sus efectos).
function adaptNavForCandidateSession() {
  const hasCandidateSession = !!localStorage.getItem(CANDIDATE_TOKEN_KEY);
  if (!hasCandidateSession) return;
  document.querySelectorAll('.nav-links a').forEach((a) => {
    const href = a.getAttribute('href');
    if (a.classList.contains('nav-cta')) {
      a.textContent = 'Cerrar sesión';
      a.setAttribute('href', '#');
      if (!a.dataset.logoutWired) {
        a.dataset.logoutWired = '1';
        a.addEventListener('click', (ev) => {
          ev.preventDefault();
          localStorage.removeItem(CANDIDATE_TOKEN_KEY);
          clearCachedCandidateSession();
          window.location.href = 'index.html';
        });
      }
    } else if (href === 'precios.html') {
      a.textContent = 'Mi estudio';
    } else if (href === 'registro-empresa.html' || a.textContent.trim() === 'Acceso empresas') {
      a.style.display = 'none';
    }
  });
}
document.addEventListener('DOMContentLoaded', adaptNavForCandidateSession);

/* ---------- Resalta en el menú la página en la que estás ----------
   Corre DESPUÉS de las dos adaptaciones de arriba (empresa/candidato) a
   propósito: esas dos a veces cambian el href de un link (ej. "Mi perfil"
   apunta a portal-empresa.html en vez de candidato.html si hay sesión de
   empresa) — si esto corriera antes, compararía contra el href viejo. El
   botón "Publicar gratis"/"Cerrar sesión" se excluye a propósito: ya tiene
   su propio estilo de botón y no es realmente un "destino" de menú. */
document.addEventListener('DOMContentLoaded', () => {
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach((a) => {
    if (a.classList.contains('nav-cta')) return;
    if (a.getAttribute('href') === currentPage) a.classList.add('active');
  });
});

/* ---------- Menú móvil ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('open');
      document.body.classList.toggle('menu-open', isOpen);
      toggle.textContent = isOpen ? '✕' : '☰';
    });
    // Cierra el menú al navegar
    links.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
      links.classList.remove('open');
      document.body.classList.remove('menu-open');
      toggle.textContent = '☰';
    }));
  }
});

/* ---------- Menú adaptado cuando hay sesión de administrador ----------
   Con sesión de admin: "Publicar gratis" cierra la sesión en vez de llevar
   a crear una cuenta de empresa (no tendría sentido para el admin), y tres
   nombres de menú cambian para reflejar lo que esa página muestra en modo
   administrador. No se valida la clave contra el servidor aquí (sería una
   llamada de más solo para pintar el menú); si ya no es válida, el
   siguiente intento de usarla en la página correspondiente la va a limpiar. */
document.addEventListener('DOMContentLoaded', () => {
  if (!getAdminSessionKey()) return;

  document.querySelectorAll('a.nav-cta').forEach((a) => {
    a.textContent = 'Salir';
    a.setAttribute('href', '#');
    a.addEventListener('click', (e) => {
      e.preventDefault();
      try { localStorage.removeItem(ADMIN_SESSION_KEY); } catch (err) {}
      window.location.reload();
    });
  });

  const RENOMBRES_NAV_ADMIN = {
    'precios.html': 'Salud y crecimiento de la plataforma',
    'candidato.html': 'Panel de control',
    'portal-empresa.html': 'Cuentas Sintro',
  };
  document.querySelectorAll('.nav-links a:not(.nav-cta)').forEach((a) => {
    const href = a.getAttribute('href');
    if (RENOMBRES_NAV_ADMIN[href]) a.textContent = RENOMBRES_NAV_ADMIN[href];
  });
});

/* ---------- Contador de visitas ----------
   Se manda una sola vez por carga de página, sin esperar respuesta ni
   importar si falla (igual que warmupAppsScript) — nunca debe sentirse en
   la navegación normal. No usa cookies ni identifica a la persona, solo
   suma 1 al contador del día para la página actual (ver logPageview_ en
   Code.gs). Se dispara para cualquier página que incluya este archivo. */
(function () {
  try {
    const pagina = (location.pathname.split('/').pop() || 'index.html');
    fetch(APPS_SCRIPT_URL + '?action=logPageview&pagina=' + encodeURIComponent(pagina)).catch(() => {});
  } catch (e) {}
})();

/* ---------- Llamadas a Apps Script ---------- */
// Antes, cuando Apps Script respondía con un código que no fuera 200 (por
// ejemplo por un error interno pasajero de Google, o si el despliegue quedó
// mal configurado), solo decíamos "Error de red..." sin más detalle — así
// era imposible saber si era un problema pasajero, de configuración, o algo
// que arreglar en el código. Ahora incluimos el código HTTP real y el
// inicio de la respuesta para poder diagnosticarlo de un vistazo.
// Acciones que el Worker de caché sabe repetir (ver cache-proxy-worker.js).
// Solo lecturas públicas y sin token — todo lo demás sigue yendo directo a
// Apps Script, sin pasar por el Worker.
const ACCIONES_CACHEABLES = ['listJobs', 'getJob'];

async function asGet(action, params = {}) {
  const usarCache = CF_CACHE_WORKER_URL && ACCIONES_CACHEABLES.includes(action);
  const base = usarCache ? CF_CACHE_WORKER_URL : APPS_SCRIPT_URL;
  const url = new URL(base);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) {
    const bodySnippet = await res.text().catch(() => '');
    throw new Error(`Error de red al consultar Apps Script (HTTP ${res.status}): ${bodySnippet.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function asPost(action, payload = {}) {
  const body = new URLSearchParams({ action, ...payload });
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const bodySnippet = await res.text().catch(() => '');
    throw new Error(`Error de red al escribir en Apps Script (HTTP ${res.status}): ${bodySnippet.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// "Despierta" a Apps Script en cuanto carga una página de login/registro,
// ANTES de que la persona termine de leer, escribir su correo o hacer clic
// en "Entrar con Google". Apps Script tarda varios segundos en arrancar
// cuando lleva un rato sin recibir peticiones ("arranque en frío") — si
// esperamos a que la persona de verdad inicie sesión para mandar la
// primera petición, esa espera la sufre justo en el peor momento. Aquí no
// esperamos la respuesta ni importa si falla (por eso el .catch vacío):
// solo nos interesa que el ping haya salido lo antes posible.
function warmupAppsScript() {
  fetch(APPS_SCRIPT_URL + '?action=ping').catch(() => {});
}

// Pone un mensaje "pending" con spinner, y si la espera se alarga, lo hace
// evidente en vez de dejar el mismo texto quieto (que se siente como que
// la página se congeló). Se usa en los formularios de login/registro de
// empresa, donde el arranque en frío de Apps Script es más notorio.
function setPendingStatus(el, text, opts = {}) {
  el.className = 'status-msg show pending';
  el.innerHTML = '<span class="spinner"></span>' + text;
  if (el._pendingTimer) clearTimeout(el._pendingTimer);
  const slowText = opts.slowText || 'Esto puede tardar varios segundos, sobre todo si es la primera vez en un rato — no cierres esta pestaña.';
  el._pendingTimer = setTimeout(() => {
    el.innerHTML = '<span class="spinner"></span>' + slowText;
  }, 4000);
}

/* ---------- API específica del negocio ---------- */
const JobMatchAPI = {
  // Vacantes
  listJobs: (filters = {}) => asGet('listJobs', filters),
  getJob: (id) => asGet('getJob', { id }),
  createJob: (companyToken, job) => asPost('createJob', { companyToken, ...job }),
  updateJob: (companyToken, jobId, job) => asPost('updateJob', { companyToken, jobId, ...job }),
  setJobFeatured: (companyToken, jobId, destacada) => asPost('setJobFeatured', { companyToken, jobId, destacada }),

  // Empresas (cuentas)
  registerEmpresa: (empresa) => asPost('registerEmpresa', empresa),
  registerEmpresaGoogle: (idToken, razonSocial, rfc) => asPost('registerEmpresaGoogle', { idToken, razonSocial, rfc }),
  loginEmpresaGoogle: (idToken) => asPost('loginEmpresaGoogle', { idToken }),
  requestEmpresaLoginLink: (email, returnUrl) => asPost('requestEmpresaLoginLink', { email, returnUrl }),
  adminLoginGoogle: (idToken) => asPost('adminLoginGoogle', { idToken }),
  getEmpresaProfile: (token) => asPost('getEmpresaProfile', { token }),
  uploadLogo: (companyToken, fileBase64, fileName) => asPost('uploadLogo', { companyToken, fileBase64, fileName }),
  updateEmpresaInfo: (companyToken, info) => asPost('updateEmpresaInfo', { companyToken, ...info }),

  // Candidatos
  registerCandidate: (candidate) => asPost('registerCandidate', candidate),
  uploadCV: (fileBase64, fileName) => asPost('uploadCV', { fileBase64, fileName }),
  getRecomendacionesPerfil: (candidateToken) => asPost('getRecomendacionesPerfil', { candidateToken }),
  generarCVConIA: (candidateToken) => asPost('generarCVConIA', { candidateToken }),
  getCandidateProfile: (candidateToken) => asPost('getCandidateProfile', { token: candidateToken }),
  listCandidatesDirectory: (companyToken, q) => asPost('listCandidatesDirectory', { companyToken: companyToken || '', q: q || '' }),
  // Las que llevan adminKey van por POST (nunca GET) para que la clave no
  // viaje en la URL ni quede guardada en el historial del navegador.
  adminListCandidatesDirectory: (adminKey) => asPost('adminListCandidatesDirectory', { adminKey }),
  adminSetJobExpiration: (adminKey, jobId, fechaExpiracion) => asPost('adminSetJobExpiration', { adminKey, jobId, fechaExpiracion: fechaExpiracion || '' }),
  adminSetJobFeatured: (adminKey, jobId, destacada) => asPost('adminSetJobFeatured', { adminKey, jobId, destacada }),
  adminUpdateJob: (adminKey, jobId, job) => asPost('adminUpdateJob', { adminKey, jobId, ...job }),
  matchCandidatesToVacancy: (companyToken, texto, jobId) => asPost('matchCandidatesToVacancy', { companyToken, texto: texto || '', jobId: jobId || '' }),
  updateApplicationStatus: (companyToken, applicationId, estado) => asPost('updateApplicationStatus', { companyToken, applicationId, estado }),
  requestContact: (companyToken, candidatoId) => asPost('requestContact', { companyToken, candidatoId }),
  getCandidateContactInfo: (companyToken, candidatoId) => asPost('getCandidateContactInfo', { companyToken, candidatoId }),
  getResumenSocioeconomicoEmpresa: (companyToken, candidatoId) => asPost('getResumenSocioeconomicoEmpresa', { companyToken, candidatoId }),
  toggleFavorito: (companyToken, candidatoId) => asPost('toggleFavorito', { companyToken, candidatoId }),
  listFavoritos: (companyToken) => asPost('listFavoritos', { companyToken }),
  getReportesEmpresa: (companyToken) => asPost('getReportesEmpresa', { companyToken }),
  proponerHorariosEntrevista: (companyToken, applicationId, opciones, notas) => asPost('proponerHorariosEntrevista', { companyToken, applicationId, opciones: JSON.stringify(opciones), notas: notas || '' }),
  getEntrevistaPublica: (entrevistaId) => asGet('getEntrevistaPublica', { entrevistaId }),
  confirmarEntrevista: (entrevistaId, horarioElegido) => asPost('confirmarEntrevista', { entrevistaId, horarioElegido }),

  // Estudio socioeconómico completo (perfil del candidato, una sola vez)
  getMySocioeconomicoCompleto: (candidateToken) => asPost('getMySocioeconomicoCompleto', { token: candidateToken }),
  saveMySocioeconomicoCompleto: (candidateToken, datos) => asPost('saveMySocioeconomicoCompleto', { candidateToken, ...datos }),
  adminListEstudiosSocioeconomicos: (adminKey) => asPost('adminListEstudiosSocioeconomicos', { adminKey }),
  adminGetEstudioSocioeconomico: (adminKey, candidatoId) => asPost('adminGetEstudioSocioeconomico', { adminKey, candidatoId }),
  adminSaveVerificacionSocioeconomica: (adminKey, candidatoId, datos) => asPost('adminSaveVerificacionSocioeconomica', { adminKey, candidatoId, ...datos }),

  // Postulaciones
  applyToJob: (application) => asPost('applyJob', application),
  listApplications: (companyToken) => asPost('listApplications', { token: companyToken }),
  getSocioeconomico: (companyToken, jobId, candidatoId) => asPost('getSocioeconomico', { companyToken, jobId, candidatoId }),

  // Administración de la plataforma
  adminListCompanies: (adminKey) => asPost('adminListCompanies', { adminKey }),
  adminListAllJobs: (adminKey) => asPost('adminListAllJobs', { adminKey }),
  adminListCandidates: (adminKey) => asPost('adminListCandidates', { adminKey }),
  adminSetPlan: (adminKey, companyToken, plan) => asPost('adminSetPlan', { adminKey, companyToken, plan }),
  adminSetVerificada: (adminKey, companyToken, verificada) => asPost('adminSetVerificada', { adminKey, companyToken, verificada }),
  adminSetEmpresaActive: (adminKey, companyToken, activa) => asPost('adminSetEmpresaActive', { adminKey, companyToken, activa }),
  adminSetJobActive: (adminKey, jobId, activa) => asPost('adminSetJobActive', { adminKey, jobId, activa }),
  adminDeleteJob: (adminKey, jobId) => asPost('adminDeleteJob', { adminKey, jobId }),
  adminDeleteCandidate: (adminKey, candidatoId) => asPost('adminDeleteCandidate', { adminKey, candidatoId }),
  adminCreateExternalJob: (adminKey, job) => asPost('adminCreateExternalJob', { adminKey, ...job }),
  adminListApplicationsForJob: (adminKey, jobId) => asPost('adminListApplicationsForJob', { adminKey, jobId }),
  adminSetTriada: (adminKey, applicationId, enTriada) => asPost('adminSetTriada', { adminKey, applicationId, enTriada }),
  adminSetReporte: (adminKey, applicationId, reporte) => asPost('adminSetReporte', { adminKey, applicationId, reporte }),
  adminExtractJobFromText: (adminKey, rawText) => asPost('adminExtractJobFromText', { adminKey, rawText }),
  adminPing: (adminKey) => asPost('adminPing', { adminKey }),
  adminCreateJob: (adminKey, job) => asPost('adminCreateJob', { adminKey, ...job }),
  adminUploadLogo: (adminKey, fileBase64, fileName) => asPost('adminUploadLogo', { adminKey, fileBase64, fileName }),
  adminGetPreciosPanel: (adminKey) => asPost('adminGetPreciosPanel', { adminKey }),
  adminGetMiPerfilPanel: (adminKey) => asPost('adminGetMiPerfilPanel', { adminKey }),
  adminGetEmpresasImpacto: (adminKey) => asPost('adminGetEmpresasImpacto', { adminKey }),

  // Pagos
  billingReceipt: (payload) => asPost('billingReceipt', payload),

  // Matching por IA vía Cloudflare Worker
  matchScore: async (cvText, jobDescription) => {
    const res = await fetch(CF_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cvText, jobDescription }),
    });
    if (!res.ok) throw new Error('Error al calcular afinidad con IA');
    return res.json();
  },
};

/* ---------- Archivos ---------- */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- Seguridad: limpiar texto de usuarios antes de mostrarlo ----------
   Cualquier dato que venga de un usuario (nombre, descripción de vacante,
   mensaje de postulación, etc.) SIEMPRE debe pasar por aquí antes de
   insertarse en el HTML de la página. Sin esto, alguien podría escribir
   código malicioso en un campo de texto normal (ej. el título de una
   vacante) y ese código se ejecutaría en el navegador de quien lo vea
   después — esto se llama XSS (Cross-Site Scripting). */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ---------- Render helpers ---------- */
function formatSalary(min, max) {
  if (!min && !max) return 'Salario a convenir';
  const fmt = (n) => new Intl.NumberFormat('es-MX').format(n);
  if (min && max) return `$${fmt(min)} – $${fmt(max)} MXN`;
  return `Desde $${fmt(min || max)} MXN`;
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 30) return `Hace ${days} días`;
  return `Hace ${Math.floor(days / 30)} meses`;
}

function shareButtonsHTML(job) {
  const url = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}vacante.html?id=${encodeURIComponent(job.id)}`;
  const texto = encodeURIComponent(`${job.titulo} — ${job.empresaNombre} | JobMatch Pro`);
  const urlEnc = encodeURIComponent(url);
  // IMPORTANTE: el atributo onclick va con comilla SIMPLE a propósito, porque
  // los íconos SVG de adentro usan comillas dobles — si el atributo también
  // usara comillas dobles, el navegador cerraría el atributo a la mitad
  // (nos pasó una vez: se veía texto roto tipo `',1500)">` en la tarjeta).
  const abrir = (href) => `event.preventDefault();event.stopPropagation();window.open("${href}","_blank","noopener,width=600,height=500")`;
  const icons = {
    facebook: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.86c0-2.51 1.5-3.9 3.79-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.91h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.15 1.45-2.15 2.94v5.67H9.34V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.61 0 4.28 2.38 4.28 5.47v6.27zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45z"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M18.9 2H22l-7.6 8.7L23.3 22h-7l-5.5-7.2L4.5 22H1.4l8.1-9.3L1 2h7.2l5 6.6L18.9 2zm-1.2 18h1.7L7.4 3.9H5.6L17.7 20z"/></svg>',
    clip: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="4" width="10" height="15" rx="2"/><path d="M9 4V3a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>',
  };
  const copyOnClick = `event.preventDefault();event.stopPropagation();navigator.clipboard.writeText("${url}");this.innerHTML=this.dataset.check;setTimeout(()=>{this.innerHTML=this.dataset.clip},1500)`;
  return `
    <div class="share-row" style="display:flex;gap:6px;margin-top:10px" onclick="event.preventDefault();event.stopPropagation()">
      <button class="share-btn" title="Compartir en Facebook" onclick='${abrir(`https://www.facebook.com/sharer/sharer.php?u=${urlEnc}`)}'>${icons.facebook}</button>
      <button class="share-btn" title="Compartir en LinkedIn" onclick='${abrir(`https://www.linkedin.com/sharing/share-offsite/?url=${urlEnc}`)}'>${icons.linkedin}</button>
      <button class="share-btn" title="Compartir en X" onclick='${abrir(`https://twitter.com/intent/tweet?url=${urlEnc}&text=${texto}`)}'>${icons.x}</button>
      <button class="share-btn" title="Copiar link para Instagram u otros" data-clip='${icons.clip}' data-check='${icons.check}' onclick='${copyOnClick}'>${icons.clip}</button>
    </div>`;
}

function featuredJobCardHTML(job) {
  const isExternal = job.fuente === 'admin';
  const empresaNombre = escapeHtml(job.empresaNombre);
  const logo = job.logoUrl
    ? `<img src="${escapeHtml(job.logoUrl)}" alt="${empresaNombre}" style="width:52px;height:52px;border-radius:12px;object-fit:cover;border:1px solid var(--line)">`
    : `<div style="width:52px;height:52px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.2rem;color:var(--orange-600);font-family:var(--font-display)">${escapeHtml((job.empresaNombre || '?').charAt(0))}</div>`;

  return `
  <a class="job-card featured-job-card" href="vacante.html?id=${encodeURIComponent(job.id)}">
    <div class="featured-ribbon">Vacante destacada</div>
    <div class="tag-row" style="justify-content:space-between;align-items:flex-start;margin-top:8px">
      <div class="tag-row" style="margin:0">
        <span class="tag" style="background:#fff">${escapeHtml(job.modalidad) || 'No especificado'}</span>
        ${isExternal ? '<span class="tag" style="background:#fff">Vacante externa</span>' : ''}
      </div>
      ${logo}
    </div>
    <h3 style="font-size:1.25rem;margin-top:10px">${escapeHtml(job.titulo)}</h3>
    <div class="company" style="font-weight:600">${empresaNombre}</div>
    <div class="meta">
      <span>📍 ${escapeHtml(job.ubicacion) || 'Remoto'}</span>
      <span>🕒 ${timeAgo(job.fecha)}</span>
    </div>
    <p class="desc" style="-webkit-line-clamp:5">${escapeHtml(job.descripcion || '')}</p>
    ${shareButtonsHTML(job)}
    <div class="foot">
      <span class="salary">${formatSalary(job.salarioMin, job.salarioMax)}</span>
      <span class="badge-pill" style="background:var(--orange-500);color:#fff">Ver vacante →</span>
    </div>
  </a>`;
}

function expandableFeaturedCardHTML(job) {
  const isExternal = job.fuente === 'admin';
  const empresaNombre = escapeHtml(job.empresaNombre);
  const logo = job.logoUrl
    ? `<img src="${escapeHtml(job.logoUrl)}" alt="${empresaNombre}" style="width:52px;height:52px;border-radius:12px;object-fit:cover;border:1px solid var(--line)">`
    : `<div style="width:52px;height:52px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.2rem;color:var(--orange-600);font-family:var(--font-display)">${escapeHtml((job.empresaNombre || '?').charAt(0))}</div>`;

  return `
  <div class="job-card featured-job-card">
    <div class="featured-ribbon">Vacante destacada</div>
    <div class="tag-row" style="justify-content:space-between;align-items:flex-start;margin-top:8px">
      <div class="tag-row" style="margin:0">
        <span class="tag" style="background:#fff">${escapeHtml(job.modalidad) || 'No especificado'}</span>
        ${isExternal ? '<span class="tag" style="background:#fff">Vacante externa</span>' : ''}
      </div>
      ${logo}
    </div>
    <a href="vacante.html?id=${encodeURIComponent(job.id)}" style="text-decoration:none;color:inherit">
      <h3 style="font-size:1.2rem;margin-top:10px">${escapeHtml(job.titulo)}</h3>
    </a>
    <div class="company" style="font-weight:600">${empresaNombre}</div>
    <div class="meta">
      <span>📍 ${escapeHtml(job.ubicacion) || 'Remoto'}</span>
      <span>🕒 ${timeAgo(job.fecha)}</span>
    </div>
    <p class="desc">${escapeHtml((job.descripcion || '').slice(0, 110))}${job.descripcion && job.descripcion.length > 110 ? '…' : ''}</p>
    <button type="button" class="btn btn-ghost expand-toggle" style="align-self:flex-start;padding:8px 16px;font-size:.82rem" onclick="toggleFeaturedExpand(this)">Ver más detalles ▾</button>
    <div class="expand-panel" style="display:none">
      <p class="desc" style="-webkit-line-clamp:unset">${escapeHtml(job.descripcion || 'Sin descripción disponible.')}</p>
      ${shareButtonsHTML(job)}
    </div>
    <div class="foot">
      <span class="salary">${formatSalary(job.salarioMin, job.salarioMax)}</span>
      <a href="vacante.html?id=${encodeURIComponent(job.id)}" class="badge-pill" style="background:var(--orange-500);color:#fff">Ver vacante completa →</a>
    </div>
  </div>`;
}

function toggleFeaturedExpand(btn) {
  const panel = btn.nextElementSibling;
  const abierto = panel.style.display === 'block';
  panel.style.display = abierto ? 'none' : 'block';
  btn.textContent = abierto ? 'Ver más detalles ▾' : 'Ocultar detalles ▴';
}

function jobCardHTML(job) {
  const isExternal = job.fuente === 'admin';
  const empresaNombre = escapeHtml(job.empresaNombre);
  const logo = job.logoUrl
    ? `<img src="${escapeHtml(job.logoUrl)}" alt="${empresaNombre}" style="width:38px;height:38px;border-radius:8px;object-fit:cover;border:1px solid var(--line)">`
    : `<div style="width:38px;height:38px;border-radius:8px;background:var(--purple-100);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--purple-700);font-family:var(--font-display)">${escapeHtml((job.empresaNombre || '?').charAt(0))}</div>`;

  const descSnippet = (job.descripcion || '').slice(0, 110);

  return `
  <a class="job-card" href="vacante.html?id=${encodeURIComponent(job.id)}">
    <div class="tag-row" style="justify-content:space-between;align-items:flex-start">
      <div class="tag-row" style="margin:0">
        <span class="tag">${escapeHtml(job.modalidad) || 'No especificado'}</span>
        ${job.destacada ? '<span class="tag tag-orange">Destacada</span>' : ''}
        ${isExternal ? '<span class="tag" style="background:#EDEBF7;color:#5B5568">Vacante externa</span>' : ''}
      </div>
      ${logo}
    </div>
    <h3>${escapeHtml(job.titulo)}</h3>
    <div class="company">${empresaNombre}</div>
    <div class="meta">
      <span>📍 ${escapeHtml(job.ubicacion) || 'Remoto'}</span>
      <span>🕒 ${timeAgo(job.fecha)}</span>
    </div>
    <p class="desc">${escapeHtml(descSnippet)}${job.descripcion && job.descripcion.length > 110 ? '…' : ''}</p>
    ${shareButtonsHTML(job)}
    <div class="foot">
      <span class="salary">${formatSalary(job.salarioMin, job.salarioMax)}</span>
      <span class="badge-pill">${isExternal ? 'Ver original →' : 'Ver vacante →'}</span>
    </div>
  </a>`;
}

function skeletonCards(n = 6) {
  return Array.from({ length: n }).map(() => `
    <div class="job-card">
      <div class="skel" style="height:20px;width:60%"></div>
      <div class="skel" style="height:14px;width:40%"></div>
      <div class="skel" style="height:60px;width:100%"></div>
    </div>`).join('');
}
