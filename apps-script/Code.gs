/**
 * JobMatch Pro (versión ligera) — backend en Apps Script
 *
 * INSTRUCCIONES DE INSTALACIÓN: ver docs/SETUP-GUIDE.md
 *
 * Antes de usar, define en Configuración del proyecto → Propiedades del
 * script: ADMIN_KEY = una contraseña larga que solo tú conozcas.
 *
 * Hojas (se crean solas):
 *
 * "Empresas": id | razonSocial | rfc | verificada | emailContacto |
 *   companyToken | plan | logoUrl | fecha
 *
 * "Vacantes": id | empresaId | fuente | empresaNombre | titulo | modalidad |
 *   ubicacion | salarioMin | salarioMax | descripcion | fecha | destacada |
 *   linkExterno | notaAdmin
 *   (fuente = "empresa" cuando la publica una empresa registrada,
 *    "admin" cuando la agregaste tú desde otro sitio — en ese caso no hay
 *    empresaId, y linkExterno/notaAdmin sí aplican)
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

const SHEET_COMPANIES = 'Empresas';
const SHEET_JOBS = 'Vacantes';
const SHEET_APPLICATIONS = 'Postulaciones';
const SHEET_CANDIDATES = 'Candidatos';
const SHEET_SOCIOECONOMIC = 'PerfilSocioeconomico';
const SHEET_PAYMENTS = 'PagosEmpresas';

const PLAN_FREE = 'Gratis';
const PLANS_PAID = ['Starter', 'Pro', 'Business', 'A la medida'];
const PLANS_WITH_SOCIOECONOMIC_ACCESS = ['Business', 'A la medida'];
const PLAN_JOB_LIMITS = { 'Gratis': 1, 'Starter': 2, 'Pro': 8, 'Business': Infinity, 'A la medida': Infinity };
const BILLING_EMAIL = 'direccion@sintropiasocial.com';

const SHEET_HEADERS = {
  [SHEET_COMPANIES]: ['id', 'razonSocial', 'rfc', 'verificada', 'emailContacto', 'companyToken', 'plan', 'logoUrl', 'fecha'],
  [SHEET_JOBS]: ['id', 'empresaId', 'fuente', 'empresaNombre', 'titulo', 'modalidad', 'ubicacion', 'salarioMin', 'salarioMax', 'descripcion', 'fecha', 'destacada', 'linkExterno', 'notaAdmin'],
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
    .filter((row) => row[0] !== '')
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

function isValidRFC_(rfc) {
  // Validación de formato (no verifica contra el SAT): 12-13 caracteres alfanuméricos
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test((rfc || '').trim());
}

/* ---------- Verificación de "Iniciar sesión con Google" ----------
   No usamos ninguna librería de criptografía: Google ya ofrece un endpoint
   público que verifica el token por nosotros y regresa los datos si es
   válido. Así evitamos tener que validar la firma JWT a mano en Apps Script. */
function verifyGoogleToken_(idToken) {
  const expectedClientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (!expectedClientId) throw new Error('Falta configurar GOOGLE_CLIENT_ID en Apps Script');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  const data = JSON.parse(res.getContentText());
  if (data.aud !== expectedClientId) return null;
  if (data.email_verified !== 'true' && data.email_verified !== true) return null;
  return { email: data.email, name: data.name || '' };
}

/* ==========================================================
   doGet
   ========================================================== */
function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'listJobs') return jsonOut_(listJobs_(e.parameter));
    if (action === 'getJob') return jsonOut_(getJob_(e.parameter.id));
    if (action === 'getEmpresaProfile') return jsonOut_(getEmpresaProfile_(e.parameter.token));
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
    if (action === 'registerEmpresa') return jsonOut_(registerEmpresa_(e.parameter));
    if (action === 'registerEmpresaGoogle') return jsonOut_(registerEmpresaGoogle_(e.parameter));
    if (action === 'loginEmpresaGoogle') return jsonOut_(loginEmpresaGoogle_(e.parameter));
    if (action === 'createJob') return jsonOut_(createJob_(e.parameter));
    if (action === 'updateJob') return jsonOut_(updateJob_(e.parameter));
    if (action === 'uploadLogo') return jsonOut_(uploadLogo_(e.parameter));
    if (action === 'applyJob') return jsonOut_(applyJob_(e.parameter));
    if (action === 'registerCandidate') return jsonOut_(registerCandidate_(e.parameter));
    if (action === 'uploadCV') return jsonOut_(uploadCV_(e.parameter));
    if (action === 'adminSetPlan') return jsonOut_(adminSetPlan_(e.parameter));
    if (action === 'paypalWebhookConfirmed') return jsonOut_(paypalWebhookConfirmed_(e.parameter));
    if (action === 'adminSetVerificada') return jsonOut_(adminSetVerificada_(e.parameter));
    if (action === 'adminCreateExternalJob') return jsonOut_(adminCreateExternalJob_(e.parameter));
    if (action === 'billingReceipt') return jsonOut_(billingReceipt_(e.parameter));
    return jsonOut_({ error: 'Acción no reconocida: ' + action });
  } catch (err) {
    return jsonOut_({ error: err.message });
  }
}

/* ---------- Cuentas demo (solo para pruebas) ----------
   Esta función NO se llama desde doGet/doPost — es intencional, así nadie
   puede activarla desde fuera. Para usarla: abre el editor de Apps Script,
   selecciona "seedDemoAccounts" en el menú desplegable de funciones (arriba,
   junto al botón ▶ Ejecutar) y dale clic a Ejecutar. Solo hace falta correrla
   una vez; si la corres de nuevo, simplemente actualiza los mismos registros
   en vez de duplicarlos. */

const DEMO_EMPRESA_EMAIL = 'coordinador1c@gmail.com';
const DEMO_EMPRESA_TOKEN = 'DEMO-EMPRESA-2026';
const DEMO_CANDIDATO_EMAIL = 'd.salgado.lpz@gmail.com';
const DEMO_CANDIDATO_TOKEN = 'DEMO-CANDIDATO-2026';

function seedDemoAccounts() {
  // --- Empresa demo (plan Pro, para poder probar edición de vacantes y logo) ---
  const empresaSheet = getSheet_(SHEET_COMPANIES);
  const empresas = sheetToObjects_(empresaSheet);
  const empresaHeaders = SHEET_HEADERS[SHEET_COMPANIES];
  const empresaExistente = empresas.find((c) => c.emailContacto === DEMO_EMPRESA_EMAIL);

  if (empresaExistente) {
    const rowIndex = empresas.indexOf(empresaExistente) + 2;
    empresaSheet.getRange(rowIndex, empresaHeaders.indexOf('companyToken') + 1).setValue(DEMO_EMPRESA_TOKEN);
    empresaSheet.getRange(rowIndex, empresaHeaders.indexOf('plan') + 1).setValue('Pro');
    empresaSheet.getRange(rowIndex, empresaHeaders.indexOf('verificada') + 1).setValue(true);
  } else {
    empresaSheet.appendRow([newId_(), 'Empresa Demo — Sintropía Social', 'DEMO010101AB1', true, DEMO_EMPRESA_EMAIL, DEMO_EMPRESA_TOKEN, 'Pro', '', new Date().toISOString()]);
  }

  // --- Candidato demo ---
  const candSheet = getSheet_(SHEET_CANDIDATES);
  const candidatos = sheetToObjects_(candSheet);
  const candHeaders = SHEET_HEADERS[SHEET_CANDIDATES];
  const candExistente = candidatos.find((c) => c.email === DEMO_CANDIDATO_EMAIL);

  if (candExistente) {
    const rowIndex = candidatos.indexOf(candExistente) + 2;
    candSheet.getRange(rowIndex, candHeaders.indexOf('candidateToken') + 1).setValue(DEMO_CANDIDATO_TOKEN);
  } else {
    candSheet.appendRow([newId_(), 'David Salgado (Demo)', DEMO_CANDIDATO_EMAIL, DEMO_CANDIDATO_TOKEN, '', new Date().toISOString()]);
  }

  Logger.log('Cuentas demo listas:');
  Logger.log('Empresa  → código: ' + DEMO_EMPRESA_TOKEN + ' (' + DEMO_EMPRESA_EMAIL + ', plan Pro)');
  Logger.log('Candidato → código: ' + DEMO_CANDIDATO_TOKEN + ' (' + DEMO_CANDIDATO_EMAIL + ')');
}

function registerEmpresaGoogle_(p) {
  const google = verifyGoogleToken_(p.idToken);
  if (!google) return { error: 'No se pudo verificar tu cuenta de Google. Intenta de nuevo.' };
  // Reutiliza la misma lógica de siempre, solo que el correo viene verificado por Google
  // en vez de ser un campo de texto libre — así nadie puede registrar una empresa con
  // un correo que no le pertenece.
  return registerEmpresa_({ razonSocial: p.razonSocial, rfc: p.rfc, emailContacto: google.email });
}

function loginEmpresaGoogle_(p) {
  const google = verifyGoogleToken_(p.idToken);
  if (!google) return { error: 'No se pudo verificar tu cuenta de Google. Intenta de nuevo.' };
  const empresas = sheetToObjects_(getSheet_(SHEET_COMPANIES));
  const empresa = empresas.find((c) => c.emailContacto.toLowerCase() === google.email.toLowerCase());
  if (!empresa) return { error: 'No existe una cuenta con este correo de Google. Regístrate primero.', necesitaRegistro: true, email: google.email, nombre: google.name };
  return { companyToken: empresa.companyToken };
}

/* ---------- Empresas (cuentas) ---------- */

function getEmpresaByToken_(token) {
  const empresas = sheetToObjects_(getSheet_(SHEET_COMPANIES));
  return empresas.find((c) => c.companyToken === token);
}

function registerEmpresa_(p) {
  if (!p.razonSocial || !p.emailContacto) return { error: 'Falta razón social o correo' };
  if (!isValidRFC_(p.rfc)) return { error: 'El RFC no tiene un formato válido. Revísalo e intenta de nuevo.' };

  const sheet = getSheet_(SHEET_COMPANIES);
  const empresas = sheetToObjects_(sheet);
  const existing = empresas.find((c) => c.emailContacto.toLowerCase() === p.emailContacto.toLowerCase() || c.rfc.toUpperCase() === p.rfc.toUpperCase());
  if (existing) return { error: 'Ya existe una cuenta con ese correo o RFC. Usa "Ya tengo cuenta" para entrar.' };

  const id = newId_();
  const companyToken = Utilities.getUuid();
  sheet.appendRow([id, p.razonSocial, p.rfc.toUpperCase(), false, p.emailContacto, companyToken, PLAN_FREE, '', new Date().toISOString()]);

  try {
    MailApp.sendEmail({
      to: p.emailContacto,
      subject: 'Tu cuenta de empresa en JobMatch Pro',
      body:
        `Hola,\n\nTu cuenta de "${p.razonSocial}" ya está creada (plan Gratis: 1 vacante activa).\n\n` +
        `Guarda este código para entrar a tu cuenta cuando quieras:\n${companyToken}\n\n` +
        `— JobMatch Pro, un proyecto de Sintropía Social`,
    });
  } catch (mailErr) {}

  return { id, companyToken };
}

function getEmpresaProfile_(token) {
  if (!token) return { error: 'Falta el código de acceso' };
  const empresa = getEmpresaByToken_(token);
  if (!empresa) return { error: 'Código no encontrado' };

  const jobs = sheetToObjects_(getSheet_(SHEET_JOBS)).filter((j) => String(j.empresaId) === String(empresa.id));
  const applications = sheetToObjects_(getSheet_(SHEET_APPLICATIONS));
  const jobIds = jobs.map((j) => String(j.id));
  const jobsWithCounts = jobs.map((j) => ({
    ...j,
    numPostulaciones: applications.filter((a) => String(a.jobId) === String(j.id)).length,
  }));

  const { companyToken, ...safeEmpresa } = empresa;
  const limit = PLAN_JOB_LIMITS[empresa.plan] ?? 1;
  return {
    empresa: safeEmpresa,
    jobs: jobsWithCounts,
    puedeEditar: PLANS_PAID.includes(empresa.plan),
    puedeSubirLogo: PLANS_PAID.includes(empresa.plan),
    vacantesActivas: jobs.length,
    limiteVacantes: limit === Infinity ? null : limit,
  };
}

function uploadLogo_(p) {
  const empresa = getEmpresaByToken_(p.companyToken);
  if (!empresa) return { error: 'No autorizado' };
  if (!PLANS_PAID.includes(empresa.plan)) return { error: 'Subir logo es una función de planes de pago. Mejora tu plan desde tu cuenta.' };
  if (!p.fileBase64 || !p.fileName) return { error: 'Falta el archivo' };

  const folders = DriveApp.getFoldersByName('JobMatch Pro - Logos');
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('JobMatch Pro - Logos');
  const blob = Utilities.newBlob(Utilities.base64Decode(p.fileBase64), 'image/png', p.fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const logoUrl = `https://lh3.googleusercontent.com/d/${file.getId()}`; // renderizable como <img>

  const sheet = getSheet_(SHEET_COMPANIES);
  const empresas = sheetToObjects_(sheet);
  const rowIndex = empresas.findIndex((c) => c.companyToken === p.companyToken);
  const logoColIndex = SHEET_HEADERS[SHEET_COMPANIES].indexOf('logoUrl') + 1;
  sheet.getRange(rowIndex + 2, logoColIndex).setValue(logoUrl);

  return { logoUrl };
}

/* ---------- Vacantes ---------- */

function enrichJobWithLogo_(job, empresasById) {
  if (job.fuente === 'empresa' && empresasById[String(job.empresaId)]) {
    return { ...job, logoUrl: empresasById[String(job.empresaId)].logoUrl || '' };
  }
  return { ...job, logoUrl: '' };
}

function listJobs_(params) {
  const jobs = sheetToObjects_(getSheet_(SHEET_JOBS));
  const empresas = sheetToObjects_(getSheet_(SHEET_COMPANIES));
  const empresasById = {};
  empresas.forEach((e) => (empresasById[String(e.id)] = e));

  let filtered = jobs;
  if (params.q) {
    const q = params.q.toLowerCase();
    filtered = filtered.filter((j) =>
      (j.titulo || '').toLowerCase().includes(q) ||
      (j.empresaNombre || '').toLowerCase().includes(q) ||
      (j.descripcion || '').toLowerCase().includes(q)
    );
  }
  if (params.modalidad) {
    filtered = filtered.filter((j) => j.modalidad === params.modalidad);
  }

  // Prioridad: vacantes de empresas registradas primero, externas (admin) al final.
  // Dentro de cada grupo: destacadas primero, luego por fecha o sueldo.
  const secondarySort = params.orden === 'sueldo'
    ? (a, b) => (b.salarioMax || b.salarioMin || 0) - (a.salarioMax || a.salarioMin || 0)
    : (a, b) => new Date(b.fecha) - new Date(a.fecha);

  filtered.sort((a, b) => {
    if (a.fuente !== b.fuente) return a.fuente === 'empresa' ? -1 : 1;
    if (!!a.destacada !== !!b.destacada) return a.destacada ? -1 : 1;
    return secondarySort(a, b);
  });

  const total = filtered.length;
  if (params.limit) filtered = filtered.slice(0, parseInt(params.limit, 10));

  filtered = filtered.map((j) => enrichJobWithLogo_(j, empresasById));
  return { items: filtered, total };
}

function getJob_(id) {
  const jobs = sheetToObjects_(getSheet_(SHEET_JOBS));
  const job = jobs.find((j) => String(j.id) === String(id));
  if (!job) return { error: 'Vacante no encontrada' };
  const empresas = sheetToObjects_(getSheet_(SHEET_COMPANIES));
  const empresasById = {};
  empresas.forEach((e) => (empresasById[String(e.id)] = e));
  const enriched = enrichJobWithLogo_(job, empresasById);
  if (job.fuente === 'empresa' && empresasById[String(job.empresaId)]) {
    enriched.plan = empresasById[String(job.empresaId)].plan;
  }
  return { job: enriched };
}

function getJobRaw_(id) {
  const jobs = sheetToObjects_(getSheet_(SHEET_JOBS));
  return jobs.find((j) => String(j.id) === String(id));
}

function createJob_(p) {
  const empresa = getEmpresaByToken_(p.companyToken);
  if (!empresa) return { error: 'Tu sesión no es válida. Vuelve a entrar a tu cuenta.' };

  const existing = sheetToObjects_(getSheet_(SHEET_JOBS)).filter((j) => String(j.empresaId) === String(empresa.id));
  const limit = PLAN_JOB_LIMITS[empresa.plan] ?? 1;
  if (existing.length >= limit) {
    return { error: `Tu plan (${empresa.plan}) permite hasta ${limit} vacante(s) activa(s). Mejora tu plan desde tu cuenta para publicar más.` };
  }

  const sheet = getSheet_(SHEET_JOBS);
  const id = newId_();
  sheet.appendRow([
    id,
    empresa.id,
    'empresa',
    empresa.razonSocial,
    p.titulo || '',
    p.modalidad || '',
    p.ubicacion || '',
    p.salarioMin || '',
    p.salarioMax || '',
    p.descripcion || '',
    new Date().toISOString(),
    false,
    '',
    '',
  ]);

  return { id };
}

function updateJob_(p) {
  const empresa = getEmpresaByToken_(p.companyToken);
  if (!empresa) return { error: 'No autorizado' };
  if (!PLANS_PAID.includes(empresa.plan)) return { error: 'Editar vacantes es una función de planes de pago. Mejora tu plan desde tu cuenta.' };

  const sheet = getSheet_(SHEET_JOBS);
  const jobs = sheetToObjects_(sheet);
  const rowIndex = jobs.findIndex((j) => String(j.id) === String(p.jobId) && String(j.empresaId) === String(empresa.id));
  if (rowIndex < 0) return { error: 'Vacante no encontrada' };

  const headers = SHEET_HEADERS[SHEET_JOBS];
  const editableFields = ['titulo', 'modalidad', 'ubicacion', 'salarioMin', 'salarioMax', 'descripcion'];
  editableFields.forEach((field) => {
    if (p[field] !== undefined) {
      sheet.getRange(rowIndex + 2, headers.indexOf(field) + 1).setValue(p[field]);
    }
  });

  return { ok: true };
}

/* ---------- Vacantes externas (agregadas por admin, sin postulación interna) ---------- */

function adminCreateExternalJob_(p) {
  if (!checkAdmin_(p.adminKey)) return { error: 'No autorizado' };
  if (!p.linkExterno) return { error: 'Falta el link de la vacante original' };

  const sheet = getSheet_(SHEET_JOBS);
  const id = newId_();
  sheet.appendRow([
    id,
    '',
    'admin',
    p.empresaNombre || 'Vacante externa',
    p.titulo || '',
    p.modalidad || '',
    p.ubicacion || '',
    p.salarioMin || '',
    p.salarioMax || '',
    p.descripcion || '',
    new Date().toISOString(),
    false,
    p.linkExterno,
    p.notaAdmin || 'Sin relación directa con la vacante — solo referencia informativa.',
  ]);

  return { id };
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
    rowIndex = candidates.indexOf(candidate) + 2;
  } else {
    candidateId = newId_();
    candidateToken = Utilities.getUuid();
    sheet.appendRow([candidateId, p.nombre || '', p.email || '', candidateToken, p.cvLink || '', new Date().toISOString()]);
  }

  if (candidate && rowIndex) {
    if (p.nombre) sheet.getRange(rowIndex, 2).setValue(p.nombre);
    if (p.cvLink) sheet.getRange(rowIndex, 5).setValue(p.cvLink);
  }

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
    return { ...a, jobTitulo: job ? job.titulo : '(vacante eliminada)', jobEmpresa: job ? job.empresaNombre : '' };
  });

  const { candidateToken, ...safeCandidate } = candidate;
  return { candidate: safeCandidate, socioeconomico: socio || null, applications: applicationsWithTitle };
}

/* ---------- Archivos (CV) ---------- */

const CV_FOLDER_NAME = 'JobMatch Pro - CVs';

function getCVFolder_() {
  const folders = DriveApp.getFoldersByName(CV_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(CV_FOLDER_NAME);
}

function uploadCV_(p) {
  if (!p.fileBase64 || !p.fileName) return { error: 'Falta el archivo' };
  const folder = getCVFolder_();
  const blob = Utilities.newBlob(Utilities.base64Decode(p.fileBase64), 'application/pdf', p.fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { cvLink: file.getUrl() };
}

/* ---------- Postulaciones (solo aplica a vacantes fuente="empresa") ---------- */

function applyJob_(p) {
  const job = getJobRaw_(p.jobId);
  if (!job) return { error: 'Vacante no encontrada' };
  if (job.fuente === 'admin') return { error: 'Esta es una vacante externa: postúlate directamente en el sitio original.' };

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
    const empresa = sheetToObjects_(getSheet_(SHEET_COMPANIES)).find((c) => String(c.id) === String(job.empresaId));
    if (empresa && empresa.emailContacto) {
      MailApp.sendEmail({
        to: empresa.emailContacto,
        subject: `Nueva postulación (${p.matchScore || '?'}% afinidad) — ${job.titulo}`,
        body:
          `${p.nombre} se postuló a "${job.titulo}" con ${p.matchScore || '?'}% de afinidad.\n\n` +
          `Correo: ${p.email}\nTeléfono: ${p.telefono || 'No proporcionado'}\n\nPerfil:\n${p.perfil}\n\n` +
          `Revisa todas tus postulaciones desde tu cuenta en JobMatch Pro.`,
      });
    }
  } catch (mailErr) {}

  return { id, ok: true, candidateToken: candidateResult.candidateToken };
}

function listApplications_(companyToken) {
  const empresa = getEmpresaByToken_(companyToken);
  if (!empresa) return { error: 'No autorizado' };

  const myJobs = sheetToObjects_(getSheet_(SHEET_JOBS)).filter((j) => String(j.empresaId) === String(empresa.id));
  const jobById = {};
  myJobs.forEach((j) => (jobById[String(j.id)] = j));
  const myJobIds = Object.keys(jobById);

  const applications = sheetToObjects_(getSheet_(SHEET_APPLICATIONS));
  const items = applications
    .filter((a) => myJobIds.includes(String(a.jobId)))
    .map((a) => {
      const job = jobById[String(a.jobId)];
      const puedeVerSocioeconomico = a.autorizoSocioeconomico === true && PLANS_WITH_SOCIOECONOMIC_ACCESS.includes(empresa.plan);
      return { ...a, jobTitulo: job.titulo, socioeconomicoDisponible: puedeVerSocioeconomico };
    });

  return { items };
}

function getSocioeconomico_(params) {
  const { companyToken, jobId, candidatoId } = params;
  if (!companyToken || !jobId || !candidatoId) return { error: 'Faltan parámetros' };

  const empresa = getEmpresaByToken_(companyToken);
  if (!empresa) return { error: 'No autorizado' };
  if (!PLANS_WITH_SOCIOECONOMIC_ACCESS.includes(empresa.plan)) {
    return { error: 'Tu plan actual no incluye acceso a datos socioeconómicos' };
  }

  const job = getJobRaw_(jobId);
  if (!job || String(job.empresaId) !== String(empresa.id)) return { error: 'No autorizado' };

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
  return { items: sheetToObjects_(getSheet_(SHEET_COMPANIES)) };
}

function adminSetPlan_(p) {
  if (!checkAdmin_(p.adminKey)) return { error: 'No autorizado' };
  const sheet = getSheet_(SHEET_COMPANIES);
  const empresas = sheetToObjects_(sheet);
  const rowIndex = empresas.findIndex((c) => c.companyToken === p.companyToken);
  if (rowIndex < 0) return { error: 'Empresa no encontrada' };
  sheet.getRange(rowIndex + 2, SHEET_HEADERS[SHEET_COMPANIES].indexOf('plan') + 1).setValue(p.plan);
  return { ok: true };
}

// Llamada por el Cloudflare Worker de PayPal (paypal-webhook-worker.js) DESPUÉS
// de verificar la firma criptográfica del webhook — Apps Script no puede
// verificarla directamente porque doPost(e) no expone los headers HTTP que
// PayPal necesita para eso. El "secret" es la única defensa de este endpoint,
// así que debe coincidir exactamente con WEBHOOK_SHARED_SECRET del Worker.
function paypalWebhookConfirmed_(p) {
  const real = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SHARED_SECRET');
  if (!real || p.secret !== real) return { error: 'No autorizado' };

  const sheet = getSheet_(SHEET_COMPANIES);
  const empresas = sheetToObjects_(sheet);
  const rowIndex = empresas.findIndex((c) => c.companyToken === p.companyToken);
  if (rowIndex < 0) return { error: 'Empresa no encontrada para ese companyToken' };

  const empresa = empresas[rowIndex];
  sheet.getRange(rowIndex + 2, SHEET_HEADERS[SHEET_COMPANIES].indexOf('plan') + 1).setValue(p.plan);

  try {
    MailApp.sendEmail({
      to: BILLING_EMAIL,
      subject: `[Automático] Plan actualizado — ${empresa.razonSocial} → ${p.plan}`,
      body:
        `El plan de "${empresa.razonSocial}" se actualizó automáticamente a "${p.plan}" ` +
        `por el evento de PayPal "${p.eventType}" (suscripción ${p.subscriptionId}).\n\n` +
        `Esto ya quedó reflejado en el Sheet — no necesitas hacer nada, es solo aviso.`,
    });
  } catch (mailErr) {}

  try {
    MailApp.sendEmail({
      to: empresa.emailContacto,
      subject: `Tu plan JobMatch Pro ahora es ${p.plan}`,
      body:
        p.plan === 'Gratis'
          ? `Hola,\n\nTu suscripción a JobMatch Pro terminó, así que tu cuenta volvió al plan Gratis (1 vacante activa).\n\n— Sintropía Social`
          : `Hola,\n\n¡Tu plan ${p.plan} ya está activo! Ya puedes usar todas sus funciones desde tu cuenta.\n\n— Sintropía Social`,
    });
  } catch (mailErr) {}

  return { ok: true };
}

function adminSetVerificada_(p) {
  if (!checkAdmin_(p.adminKey)) return { error: 'No autorizado' };
  const sheet = getSheet_(SHEET_COMPANIES);
  const empresas = sheetToObjects_(sheet);
  const rowIndex = empresas.findIndex((c) => c.companyToken === p.companyToken);
  if (rowIndex < 0) return { error: 'Empresa no encontrada' };
  sheet.getRange(rowIndex + 2, SHEET_HEADERS[SHEET_COMPANIES].indexOf('verificada') + 1).setValue(p.verificada === 'true');
  return { ok: true };
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
    `Dirección fiscal: ${p.direccionFiscal || ''}\nUso de CFDI: ${p.usoCFDI || ''}\n\n` +
    `Recuerda subir el plan manualmente en admin-plataforma.html.`;

  try {
    MailApp.sendEmail({ to: BILLING_EMAIL, subject: `Nuevo pago JobMatch Pro — Plan ${p.plan}`, body: bodyInterno });
  } catch (mailErr) {}

  try {
    if (p.companyEmail) {
      MailApp.sendEmail({
        to: p.companyEmail,
        subject: `Comprobante de tu suscripción JobMatch Pro — Plan ${p.plan}`,
        body:
          `Hola,\n\nConfirmamos tu suscripción al plan ${p.plan} de JobMatch Pro.\nID de suscripción: ${p.subscriptionId}\n\n` +
          `Activaremos las funciones de tu plan en tu cuenta en un plazo de hasta 24 horas.\n\n— Sintropía Social`,
      });
    }
  } catch (mailErr) {}

  return { ok: true };
}
