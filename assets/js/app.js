/* ==========================================================
   JobMatch Pro (versión ligera) — configuración y helpers
   ========================================================== */

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz-PlmaDw5_8NbBawOkz0E5K8lQ-9EPz4-BRBY29GaIHTH9sTlhhobJFIqR8rndnTd5/exec";
const CF_WORKER_URL = "https://jobmatch-paypal-webhook.coordinador1-ce.workers.dev/";
const GOOGLE_CLIENT_ID = "1048097062338-9dj7eluj20ie8721vt5rfdgi1djk7ihj.apps.googleusercontent.com";

const COMPANY_TOKEN_KEY = 'jobmatch_company_token';
const CANDIDATE_TOKEN_KEY = 'jobmatch_candidate_token';

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

/* ---------- Llamadas a Apps Script ---------- */
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
  adminLoginGoogle: (idToken) => asPost('adminLoginGoogle', { idToken }),
  getEmpresaProfile: (token) => asGet('getEmpresaProfile', { token }),
  uploadLogo: (companyToken, fileBase64, fileName) => asPost('uploadLogo', { companyToken, fileBase64, fileName }),

  // Candidatos
  registerCandidate: (candidate) => asPost('registerCandidate', candidate),
  uploadCV: (fileBase64, fileName) => asPost('uploadCV', { fileBase64, fileName }),
  getCandidateProfile: (candidateToken) => asGet('getCandidateProfile', { token: candidateToken }),

  // Postulaciones
  applyToJob: (application) => asPost('applyJob', application),
  listApplications: (companyToken) => asGet('listApplications', { token: companyToken }),
  getSocioeconomico: (companyToken, jobId, candidatoId) => asGet('getSocioeconomico', { companyToken, jobId, candidatoId }),

  // Administración de la plataforma
  adminListCompanies: (adminKey) => asGet('adminListCompanies', { adminKey }),
  adminListAllJobs: (adminKey) => asGet('adminListAllJobs', { adminKey }),
  adminListCandidates: (adminKey) => asGet('adminListCandidates', { adminKey }),
  adminSetPlan: (adminKey, companyToken, plan) => asPost('adminSetPlan', { adminKey, companyToken, plan }),
  adminSetVerificada: (adminKey, companyToken, verificada) => asPost('adminSetVerificada', { adminKey, companyToken, verificada }),
  adminSetEmpresaActive: (adminKey, companyToken, activa) => asPost('adminSetEmpresaActive', { adminKey, companyToken, activa }),
  adminSetJobActive: (adminKey, jobId, activa) => asPost('adminSetJobActive', { adminKey, jobId, activa }),
  adminDeleteJob: (adminKey, jobId) => asPost('adminDeleteJob', { adminKey, jobId }),
  adminDeleteCandidate: (adminKey, candidatoId) => asPost('adminDeleteCandidate', { adminKey, candidatoId }),
  adminCreateExternalJob: (adminKey, job) => asPost('adminCreateExternalJob', { adminKey, ...job }),
  adminListApplicationsForJob: (adminKey, jobId) => asGet('adminListApplicationsForJob', { adminKey, jobId }),
  adminSetTriada: (adminKey, applicationId, enTriada) => asPost('adminSetTriada', { adminKey, applicationId, enTriada }),
  adminSetReporte: (adminKey, applicationId, reporte) => asPost('adminSetReporte', { adminKey, applicationId, reporte }),
  adminExtractJobFromText: (adminKey, rawText) => asPost('adminExtractJobFromText', { adminKey, rawText }),

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
