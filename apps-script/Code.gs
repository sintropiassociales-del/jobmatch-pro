/**
 * JobMatch Pro (versión ligera) — backend en Apps Script
 * Usa un Google Sheet como base de datos. Mismo patrón que tus otros
 * proyectos (repositorio bibliográfico, SintropíaDash).
 *
 * INSTRUCCIONES DE INSTALACIÓN: ver docs/SETUP-GUIDE.md
 *
 * Antes de usar, define la clave de administrador en:
 *   Configuración del proyecto (⚙️) → Propiedades del script → Añadir propiedad
 *   Nombre: ADMIN_KEY   Valor: (una contraseña larga que solo tú conozcas)
 *
 * Estructura del Google Sheet (las hojas se crean solas la primera vez):
 *
 * "Vacantes": id | empresa | emailContacto | companyToken | titulo |
 *   modalidad | ubicacion | salarioMin | salarioMax | descripcion | fecha |
 *   destacada | plan
 *
 * "Postulaciones": id | jobId | candidatoId | nombre | email | telefono |
 *   perfil | matchScore | autorizoSocioeconomico | fecha
 *
 * "Candidatos": id | nombre | email | candidateToken | cvLink | fecha
 *
 * "PerfilSocioeconomico": candidatoId | ingresoFamiliar |
 *   dependientesEconomicos | tipoVivienda | escolaridad |
 *   situacionVulnerabilidad | notasAdicionales | fecha
 *
 * "PagosEmpresas": fecha | plan | subscriptionId | payerName | payerEmail |
 *   razonSocial | rfc | direccionFiscal | usoCFDI | companyEmail
 */

const SHEET_JOBS = 'Vacantes';
const SHEET_APPLICATIONS = 'Postulaciones';
const SHEET_CANDIDATES = 'Candidatos';
const SHEET_SOCIOECONOMIC = 'PerfilSocioeconomico';
const SHEET_PAYMENTS = 'PagosEmpresas';

const PLANS_WITH_SOCIOECONOMIC_ACCESS = ['Business', 'A la medida'];
const BILLING_EMAIL = 'direccion@sintropiasocial.com';

const SHEET_HEADERS = {
  [SHEET_JOBS]: ['id', 'empresa', 'emailContacto', 'companyToken', 'titulo', 'modalidad', 'ubicacion', 'salarioMin', 'salarioMax', 'descripcion', 'fecha', 'destacada', 'plan'],
  [SHEET_APPLICATIONS]: ['id', 'jobId', 'candidatoId', 'nombre', 'email', 'telefono', 'perfil', 'matchScore', 'autorizoSocioeconomico', 'fecha'],
  [SHEET_CANDIDATES]: ['id', 'nombre', 'email', 'candidateToken', 'cvLink', 'fecha'],
  [SHEET_SOCIOECONOMIC]: ['candidatoId', 'ingresoFamiliar', 'dependientesEconomicos', 'tipoVivienda', 'escolaridad', 'situacionVulnerabilidad', 'notasAdicionales', 'fecha'],
  [SHEET_PAYMENTS]: ['fecha', 'plan', 'subscriptionId', 'payerName', 'payerEmail', 'razonSocial', 'rfc', 'direccionFiscal', 'usoCFDI', 'companyEmail'],
};

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(SHEET_HEADERS[name]);
  }
  return sheet;
}

function sheetToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values
    .filter((row) => row[0] !== '') // ignora filas vacías
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = row[i]));
      return obj;
    });
}

function newId_() {
  return Utilities.getUuid().split('-')[0];
}

function jsonOut_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function checkAdmin_(key) {
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  return !!real && key === real;
}

/* ==========================================================
   doGet
   ========================================================== */
function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'listJobs') return jsonOut_(listJobs_(e.parameter));
    if (action === 'getJob') return jsonOut_(getJob_(e.parameter.id));
    if (action === 'listApplications') return jsonOut_(listApplications_(e.parameter.token));
    if (action === 'getCandidateProfile') return jsonOut_(getCandidateProfile_(e.parameter.token));
    if (action === 'getSocioeconomico') return jsonOut_(getSocioeconomico_(e.parameter));
    if (action === 'adminListCompanies') return jsonOut_(adminListCompanies_(e.parameter.adminKey));
    return jsonOut_({ error: 'Acción no reconocida: ' + action });
  } catch (err) {
    return jsonOut_({ error: err.message });
  }
}

/* ==========================================================
   doPost
   ========================================================== */
function doPost(e) {
  try {
    const action = e.parameter.action;
    if (action === 'createJob') return jsonOut_(createJob_(e.parameter));
    if (action === 'applyJob') return jsonOut_(applyJob_(e.parameter));
    if (action === 'registerCandidate') return jsonOut_(registerCandidate_(e.parameter));
    if (action === 'uploadCV') return jsonOut_(uploadCV_(e.parameter));
    if (action === 'adminSetPlan') return jsonOut_(adminSetPlan_(e.parameter));
    if (action === 'billingReceipt') return jsonOut_(billingReceipt_(e.parameter));
    return jsonOut_({ error: 'Acción no reconocida: ' + action });
  } catch (err) {
    return jsonOut_({ error: err.message });
  }
}

/* ---------- Vacantes ---------- */

function listJobs_(params) {
  const jobs = sheetToObjects_(getSheet_(SHEET_JOBS));
  let filtered = jobs;

  if (params.q) {
    const q = params.q.toLowerCase();
    filtered = filtered.filter((j) =>
      (j.titulo || '').toLowerCase().includes(q) ||
      (j.empresa || '').toLowerCase().includes(q) ||
      (j.descripcion || '').toLowerCase().includes(q)
    );
  }
  if (params.modalidad) {
    filtered = filtered.filter((j) => j.modalidad === params.modalidad);
  }

  if (params.orden === 'sueldo') {
    filtered.sort((a, b) => (b.salarioMax || b.salarioMin || 0) - (a.salarioMax || a.salarioMin || 0));
  } else {
    filtered.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }

  const total = filtered.length;
  if (params.limit) filtered = filtered.slice(0, parseInt(params.limit, 10));

  // Nunca exponer el companyToken en listados públicos
  filtered = filtered.map((j) => { const { companyToken, ...rest } = j; return rest; });

  return { items: filtered, total };
}

function getJob_(id) {
  const jobs = sheetToObjects_(getSheet_(SHEET_JOBS));
  const job = jobs.find((j) => String(j.id) === String(id));
  if (!job) return { error: 'Vacante no encontrada' };
  const { companyToken, ...publicJob } = job;
  return { job: publicJob };
}

function getJobRaw_(id) {
  const jobs = sheetToObjects_(getSheet_(SHEET_JOBS));
  return jobs.find((j) => String(j.id) === String(id));
}

function createJob_(p) {
  const sheet = getSheet_(SHEET_JOBS);
  const id = newId_();
  const companyToken = Utilities.getUuid();
  sheet.appendRow([
    id,
    p.empresa || '',
    p.emailContacto || '',
    companyToken,
    p.titulo || '',
    p.modalidad || '',
    p.ubicacion || '',
    p.salarioMin || '',
    p.salarioMax || '',
    p.descripcion || '',
    new Date().toISOString(),
    p.destacada === 'true',
    'Starter', // plan por defecto; se actualiza manualmente al confirmar pago (ver adminSetPlan)
  ]);

  try {
    MailApp.sendEmail({
      to: p.emailContacto,
      subject: 'Tu vacante fue publicada en JobMatch Pro',
      body:
        `Hola,\n\nTu vacante "${p.titulo}" ya está publicada.\n\n` +
        `Guarda este token para ver tus postulaciones en el panel de empresa:\n${companyToken}\n\n` +
        `— JobMatch Pro, un proyecto de Sintropía Social`,
    });
  } catch (mailErr) {
    // Si falla el correo no debe tronar la publicación
  }

  return { id, companyToken };
}

/* ---------- Archivos (CV) ---------- */

const CV_FOLDER_NAME = 'JobMatch Pro - CVs';

function getCVFolder_() {
  const folders = DriveApp.getFoldersByName(CV_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(CV_FOLDER_NAME);
}

// Recibe el PDF codificado en base64 desde el navegador (sin backend propio,
// así que el archivo viaja como texto en el POST) y lo guarda en Drive.
function uploadCV_(p) {
  if (!p.fileBase64 || !p.fileName) return { error: 'Falta el archivo' };
  const folder = getCVFolder_();
  const blob = Utilities.newBlob(Utilities.base64Decode(p.fileBase64), 'application/pdf', p.fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { cvLink: file.getUrl() };
}

/* ---------- Candidatos ---------- */

function registerCandidate_(p) {
  const sheet = getSheet_(SHEET_CANDIDATES);
  const candidates = sheetToObjects_(sheet);
  let candidate = candidates.find((c) => c.email.toLowerCase() === (p.email || '').toLowerCase());

  let candidateId, candidateToken, rowIndex;
  if (candidate) {
    candidateId = candidate.id;
    candidateToken = candidate.candidateToken;
    rowIndex = candidates.indexOf(candidate) + 2; // +1 header, +1 base-1
  } else {
    candidateId = newId_();
    candidateToken = Utilities.getUuid();
    sheet.appendRow([candidateId, p.nombre || '', p.email || '', candidateToken, p.cvLink || '', new Date().toISOString()]);
  }

  // Si ya existía y manda nuevos datos, actualiza nombre/CV
  if (candidate && rowIndex) {
    if (p.nombre) sheet.getRange(rowIndex, 2).setValue(p.nombre);
    if (p.cvLink) sheet.getRange(rowIndex, 5).setValue(p.cvLink);
  }

  // Perfil socioeconómico (opcional, sensible)
  if (p.ingresoFamiliar || p.dependientesEconomicos || p.tipoVivienda || p.escolaridad || p.situacionVulnerabilidad || p.notasAdicionales) {
    upsertSocioeconomico_(candidateId, p);
  }

  try {
    MailApp.sendEmail({
      to: p.email,
      subject: 'Tu perfil en JobMatch Pro',
      body:
        `Hola ${p.nombre || ''},\n\nGuarda este código para volver a entrar a tu perfil cuando quieras:\n${candidateToken}\n\n` +
        `— JobMatch Pro, un proyecto de Sintropía Social`,
    });
  } catch (mailErr) {}

  return { id: candidateId, candidateToken };
}

function upsertSocioeconomico_(candidateId, p) {
  const sheet = getSheet_(SHEET_SOCIOECONOMIC);
  const rows = sheetToObjects_(sheet);
  const existingIndex = rows.findIndex((r) => String(r.candidatoId) === String(candidateId));
  const rowData = [
    candidateId,
    p.ingresoFamiliar || '',
    p.dependientesEconomicos || '',
    p.tipoVivienda || '',
    p.escolaridad || '',
    p.situacionVulnerabilidad || '',
    p.notasAdicionales || '',
    new Date().toISOString(),
  ];
  if (existingIndex >= 0) {
    sheet.getRange(existingIndex + 2, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
}

function getCandidateProfile_(token) {
  if (!token) return { error: 'Falta el código de acceso' };
  const candidates = sheetToObjects_(getSheet_(SHEET_CANDIDATES));
  const candidate = candidates.find((c) => c.candidateToken === token);
  if (!candidate) return { error: 'Código no encontrado' };

  const socio = sheetToObjects_(getSheet_(SHEET_SOCIOECONOMIC)).find((s) => String(s.candidatoId) === String(candidate.id));

  const applications = sheetToObjects_(getSheet_(SHEET_APPLICATIONS)).filter((a) => String(a.candidatoId) === String(candidate.id));
  const jobs = sheetToObjects_(getSheet_(SHEET_JOBS));
  const applicationsWithTitle = applications.map((a) => {
    const job = jobs.find((j) => String(j.id) === String(a.jobId));
    return { ...a, jobTitulo: job ? job.titulo : '(vacante eliminada)', jobEmpresa: job ? job.empresa : '' };
  });

  const { candidateToken, ...safeCandidate } = candidate;
  return { candidate: safeCandidate, socioeconomico: socio || null, applications: applicationsWithTitle };
}

/* ---------- Postulaciones ---------- */

function applyJob_(p) {
  // Asegura que exista un registro de candidato ligado a este correo
  const candidateResult = registerCandidate_({ nombre: p.nombre, email: p.email, cvLink: p.cvLink });

  const sheet = getSheet_(SHEET_APPLICATIONS);
  const id = newId_();
  sheet.appendRow([
    id,
    p.jobId || '',
    candidateResult.id,
    p.nombre || '',
    p.email || '',
    p.telefono || '',
    p.perfil || '',
    p.matchScore || '',
    p.autorizoSocioeconomico === 'true',
    new Date().toISOString(),
  ]);

  try {
    const job = getJobRaw_(p.jobId);
    if (job && job.emailContacto) {
      MailApp.sendEmail({
        to: job.emailContacto,
        subject: `Nueva postulación (${p.matchScore || '?'}% afinidad) — ${job.titulo}`,
        body:
          `${p.nombre} se postuló a "${job.titulo}" con ${p.matchScore || '?'}% de afinidad.\n\n` +
          `Correo: ${p.email}\nTeléfono: ${p.telefono || 'No proporcionado'}\n\nPerfil:\n${p.perfil}\n\n` +
          `Revisa todas tus postulaciones en el panel de empresa de JobMatch Pro.`,
      });
    }
  } catch (mailErr) {}

  return { id, ok: true, candidateToken: candidateResult.candidateToken };
}

function listApplications_(token) {
  if (!token) return { error: 'Falta el token de empresa' };
  const jobs = sheetToObjects_(getSheet_(SHEET_JOBS));
  const myJobs = jobs.filter((j) => j.companyToken === token);
  if (myJobs.length === 0) return { items: [] };

  const myJobIds = myJobs.map((j) => String(j.id));
  const jobById = {};
  myJobs.forEach((j) => (jobById[String(j.id)] = j));

  const applications = sheetToObjects_(getSheet_(SHEET_APPLICATIONS));
  const items = applications
    .filter((a) => myJobIds.includes(String(a.jobId)))
    .map((a) => {
      const job = jobById[String(a.jobId)];
      const puedeVerSocioeconomico = a.autorizoSocioeconomico === true && PLANS_WITH_SOCIOECONOMIC_ACCESS.includes(job.plan);
      return {
        ...a,
        jobTitulo: job.titulo,
        socioeconomicoDisponible: puedeVerSocioeconomico,
      };
    });

  return { items };
}

/* Datos socioeconómicos: solo visibles para el candidato, el admin de la
   plataforma, y una empresa Business/A la medida CON autorización explícita
   del candidato en esa postulación específica. */
function getSocioeconomico_(params) {
  const { companyToken, jobId, candidatoId } = params;
  if (!companyToken || !jobId || !candidatoId) return { error: 'Faltan parámetros' };

  const job = getJobRaw_(jobId);
  if (!job || job.companyToken !== companyToken) return { error: 'No autorizado' };
  if (!PLANS_WITH_SOCIOECONOMIC_ACCESS.includes(job.plan)) {
    return { error: 'Tu plan actual no incluye acceso a datos socioeconómicos' };
  }

  const applications = sheetToObjects_(getSheet_(SHEET_APPLICATIONS));
  const application = applications.find((a) => String(a.jobId) === String(jobId) && String(a.candidatoId) === String(candidatoId));
  if (!application || application.autorizoSocioeconomico !== true) {
    return { error: 'El candidato no ha autorizado compartir esta información' };
  }

  const socio = sheetToObjects_(getSheet_(SHEET_SOCIOECONOMIC)).find((s) => String(s.candidatoId) === String(candidatoId));
  if (!socio) return { error: 'El candidato no completó su perfil socioeconómico' };
  return { socioeconomico: socio };
}

/* ---------- Administración de la plataforma (Sintropía Social) ---------- */

function adminListCompanies_(adminKey) {
  if (!checkAdmin_(adminKey)) return { error: 'No autorizado' };
  const jobs = sheetToObjects_(getSheet_(SHEET_JOBS));
  return { items: jobs };
}

// Después de confirmar manualmente un pago de PayPal (ver correo a
// direccion@sintropiasocial.com), usa esta acción para subir el plan de
// una empresa. Requiere el companyToken que la empresa recibió al publicar.
function adminSetPlan_(p) {
  if (!checkAdmin_(p.adminKey)) return { error: 'No autorizado' };
  const sheet = getSheet_(SHEET_JOBS);
  const jobs = sheetToObjects_(sheet);
  const planColIndex = SHEET_HEADERS[SHEET_JOBS].indexOf('plan') + 1;
  let updated = 0;
  jobs.forEach((j, i) => {
    if (j.companyToken === p.companyToken) {
      sheet.getRange(i + 2, planColIndex).setValue(p.plan);
      updated++;
    }
  });
  return { updated };
}

/* ---------- Pagos y facturación ---------- */

function billingReceipt_(p) {
  const sheet = getSheet_(SHEET_PAYMENTS);
  sheet.appendRow([
    new Date().toISOString(),
    p.plan || '',
    p.subscriptionId || '',
    p.payerName || '',
    p.payerEmail || '',
    p.razonSocial || '',
    p.rfc || '',
    p.direccionFiscal || '',
    p.usoCFDI || '',
    p.companyEmail || '',
  ]);

  const bodyInterno =
    `Nueva suscripción a JobMatch Pro.\n\n` +
    `Plan: ${p.plan}\nID de suscripción PayPal: ${p.subscriptionId}\n\n` +
    `--- Datos de facturación ---\n` +
    `Nombre del pagador (PayPal): ${p.payerName || 'No disponible'}\n` +
    `Correo del pagador (PayPal): ${p.payerEmail || 'No disponible'}\n` +
    `Correo de la empresa: ${p.companyEmail || ''}\n` +
    `Razón social: ${p.razonSocial || ''}\nRFC: ${p.rfc || ''}\n` +
    `Dirección fiscal: ${p.direccionFiscal || ''}\nUso de CFDI: ${p.usoCFDI || ''}\n`;

  try {
    MailApp.sendEmail({
      to: BILLING_EMAIL,
      subject: `Nuevo pago JobMatch Pro — Plan ${p.plan}`,
      body: bodyInterno,
    });
  } catch (mailErr) {}

  // Comprobante para quien pagó
  try {
    if (p.companyEmail) {
      MailApp.sendEmail({
        to: p.companyEmail,
        subject: `Comprobante de tu suscripción JobMatch Pro — Plan ${p.plan}`,
        body:
          `Hola,\n\nConfirmamos tu suscripción al plan ${p.plan} de JobMatch Pro.\n` +
          `ID de suscripción: ${p.subscriptionId}\n\n` +
          `En un plazo de hasta 24 horas activaremos las funciones de tu plan en la plataforma.\n\n` +
          `— Sintropía Social`,
      });
    }
  } catch (mailErr) {}

  return { ok: true };
}
