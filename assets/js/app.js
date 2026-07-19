/* ==========================================================
   JobMatch Pro (versión ligera) — configuración y helpers
   ========================================================== */

// 1. Pega aquí la URL de tu Web App de Apps Script (ver docs/SETUP-GUIDE.md paso 3)
const APPS_SCRIPT_URL = "PEGA_AQUI_TU_URL_DE_APPS_SCRIPT";

// 2. Pega aquí la URL de tu Cloudflare Worker (mismo patrón que tus otras herramientas)
const CF_WORKER_URL = "PEGA_AQUI_TU_URL_DE_CLOUDFLARE_WORKER";

/* ---------- Menú móvil ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }
});

/* ---------- Llamadas a Apps Script ---------- */
// Apps Script Web Apps solo aceptan GET/POST simples (sin headers custom)
// para evitar problemas de CORS, así que mandamos todo como querystring o
// x-www-form-urlencoded.

async function asGet(action, params = {}) {
  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Error de red al consultar Apps Script');
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
  if (!res.ok) throw new Error('Error de red al escribir en Apps Script');
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/* ---------- API específica del negocio ---------- */
const JobMatchAPI = {
  listJobs: (filters = {}) => asGet('listJobs', filters),
  getJob: (id) => asGet('getJob', { id }),
  createJob: (job) => asPost('createJob', job),
  applyToJob: (application) => asPost('applyJob', application),
  listApplications: (companyToken) => asGet('listApplications', { token: companyToken }),
  registerCandidate: (candidate) => asPost('registerCandidate', candidate),
  uploadCV: (fileBase64, fileName) => asPost('uploadCV', { fileBase64, fileName }),
  getCandidateProfile: (candidateToken) => asGet('getCandidateProfile', { token: candidateToken }),
  getSocioeconomico: (companyToken, jobId, candidatoId) => asGet('getSocioeconomico', { companyToken, jobId, candidatoId }),
  adminListCompanies: (adminKey) => asGet('adminListCompanies', { adminKey }),
  adminSetPlan: (adminKey, companyToken, plan) => asPost('adminSetPlan', { adminKey, companyToken, plan }),
  billingReceipt: (payload) => asPost('billingReceipt', payload),
  // Matching por IA vía Cloudflare Worker (igual patrón que tu proxy hidden-frog-3123)
  matchScore: async (cvText, jobDescription) => {
    const res = await fetch(CF_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cvText, jobDescription }),
    });
    if (!res.ok) throw new Error('Error al calcular afinidad con IA');
    return res.json(); // { score: 0-100, reasoning: "..." }
  },
};

/* ---------- Archivos ---------- */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]); // quita el prefijo data:...;base64,
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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

function jobCardHTML(job) {
  const match = job.matchScore != null ? job.matchScore : null;
  return `
  <a class="job-card" href="vacante.html?id=${encodeURIComponent(job.id)}">
    <div class="tag-row">
      <span class="tag">${job.modalidad || 'No especificado'}</span>
      ${job.destacada ? '<span class="tag tag-orange">Destacada</span>' : ''}
    </div>
    <h3>${job.titulo}</h3>
    <div class="company">${job.empresa}</div>
    <div class="meta">
      <span>📍 ${job.ubicacion || 'Remoto'}</span>
      <span>🕒 ${timeAgo(job.fecha)}</span>
    </div>
    <p class="desc">${(job.descripcion || '').slice(0, 110)}${job.descripcion && job.descripcion.length > 110 ? '…' : ''}</p>
    ${match !== null ? `
    <div class="match">
      <div class="match-track"><div class="match-fill" style="width:${match}%"></div></div>
      <span class="match-label">${match}% afinidad</span>
    </div>` : ''}
    <div class="foot">
      <span class="salary">${formatSalary(job.salarioMin, job.salarioMax)}</span>
      <span class="badge-pill">Ver vacante →</span>
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
