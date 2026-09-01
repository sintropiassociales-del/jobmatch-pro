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
const SHEET_CONTACT_REQUESTS = 'SolicitudesContacto';

const PLAN_FREE = 'Gratis';
const PLANS_PAID = ['Starter', 'Pro', 'Business', 'A la medida'];
const PLANS_WITH_SOCIOECONOMIC_ACCESS = ['Business', 'A la medida'];
const PLAN_JOB_LIMITS = { 'Gratis': 1, 'Starter': 2, 'Pro': 8, 'Business': Infinity, 'A la medida': Infinity };
const PLAN_FEATURED_MONTHLY_LIMIT = { 'Pro': 2, 'Business': 5, 'A la medida': Infinity }; // vacantes que se pueden destacar por mes; planes sin entrada aquí no pueden destacar
const FREE_PLAN_MONTHLY_POST_LIMIT = 2; // además del límite de activas, el plan Gratis solo publica 2 vacantes nuevas por mes
const BILLING_EMAIL = 'direccion@sintropiasocial.com';

const SHEET_HEADERS = {
  [SHEET_COMPANIES]: ['id', 'razonSocial', 'rfc', 'verificada', 'activa', 'emailContacto', 'companyToken', 'plan', 'logoUrl', 'fecha'],
  [SHEET_JOBS]: ['id', 'empresaId', 'fuente', 'empresaNombre', 'titulo', 'modalidad', 'ubicacion', 'salarioMin', 'salarioMax', 'descripcion', 'fecha', 'destacada', 'destacadaEn', 'activa', 'linkExterno', 'notaAdmin'],
  [SHEET_APPLICATIONS]: ['id', 'jobId', 'candidatoId', 'nombre', 'email', 'telefono', 'perfil', 'matchScore', 'autorizoSocioeconomico', 'fecha', 'enTriada', 'reporteAdmin'],
  [SHEET_CANDIDATES]: ['id', 'nombre', 'email', 'candidateToken', 'cvLink', 'fecha', 'habilidades'],
  [SHEET_SOCIOECONOMIC]: ['candidatoId', 'ingresoFamiliar', 'dependientesEconomicos', 'tipoVivienda', 'escolaridad', 'situacionVulnerabilidad', 'notasAdicionales', 'fecha'],
  [SHEET_PAYMENTS]: ['fecha', 'plan', 'subscriptionId', 'payerName', 'payerEmail', 'razonSocial', 'rfc', 'direccionFiscal', 'usoCFDI', 'companyEmail'],
  [SHEET_CONTACT_REQUESTS]: ['id', 'candidatoId', 'empresaId', 'companyToken', 'empresaNombre', 'estado', 'fecha'],
};

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(SHEET_HEADERS[name]);
    return sheet;
  }
  // Auto-migración de esquema: si el código conoce un campo que la hoja
  // todavía no tiene en su fila de encabezados, se agrega solo al final.
  // Esto evita tener que editar el Sheet a mano cada vez que agregamos un
  // campo nuevo (nos pasó 3 veces antes de este arreglo).
  const lastCol = sheet.getLastColumn();
  const currentHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const canonical = SHEET_HEADERS[name] || [];
  const missing = canonical.filter((h) => currentHeaders.indexOf(h) === -1);
  if (missing.length > 0) {
    sheet.getRange(1, currentHeaders.length + 1, 1, missing.length).setValues([missing]);
  }
  return sheet;
}

// Escribe una fila nueva usando los NOMBRES de columna, no su posición —
// así el orden real de columnas en tu Sheet ya no importa, siempre y cuando
// el nombre exista en la fila de encabezados (que getSheet_ ya garantiza).
function appendRowByHeader_(sheet, data) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const row = headers.map((h) => (data[h] !== undefined ? data[h] : ''));
  sheet.appendRow(row);
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

// Protección contra fuerza bruta: si fallan 8 intentos seguidos en 15 minutos,
// bloquea nuevos intentos por 15 minutos — sin esto, alguien podría probar
// miles de claves seguidas hasta acertar.
function checkAdmin_(key) {
  const cache = CacheService.getScriptCache();
  if (cache.get('admin_lockout')) return false;

  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  const ok = !!real && key === real;

  if (ok) {
    cache.remove('admin_fail_count');
    return true;
  }

  const fails = parseInt(cache.get('admin_fail_count') || '0', 10) + 1;
  cache.put('admin_fail_count', String(fails), 900);
  if (fails >= 8) cache.put('admin_lockout', 'true', 900);
  return false;
}

function adminLockoutActive_() {
  return !!CacheService.getScriptCache().get('admin_lockout');
}

// Fricción básica contra spam: evita que la misma acción se repita en ráfaga
// desde el mismo correo. No sustituye un CAPTCHA, pero frena scripts simples.
function tooSoon_(key, seconds) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'cooldown_' + key;
  if (cache.get(cacheKey)) return true;
  cache.put(cacheKey, 'true', seconds);
  return false;
}

// Busca en qué columna está un campo leyendo el encabezado REAL de la hoja,
// nunca asumiendo el orden canónico.
function colIndex_(sheet, fieldName) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  return headers.indexOf(fieldName) + 1;
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
    if (action === 'respondContactRequest') return respondContactRequestPage_(e.parameter);
    if (action === 'listJobs') return jsonOut_(listJobs_(e.parameter));
    if (action === 'getJob') return jsonOut_(getJob_(e.parameter.id));
    if (action === 'getEmpresaProfile') return jsonOut_(getEmpresaProfile_(e.parameter.token));
    if (action === 'listCandidatesDirectory') return jsonOut_(listCandidatesDirectory_(e.parameter));
    if (action === 'getCandidateContactInfo') return jsonOut_(getCandidateContactInfo_(e.parameter));
    if (action === 'getCandidateProfile') return jsonOut_(getCandidateProfile_(e.parameter.token));
    if (action === 'getSocioeconomico') return jsonOut_(getSocioeconomico_(e.parameter));
    if (action === 'adminListCompanies') return jsonOut_(adminListCompanies_(e.parameter.adminKey));
    if (action === 'adminListAllJobs') return jsonOut_(adminListAllJobs_(e.parameter.adminKey));
    if (action === 'adminListApplicationsForJob') return jsonOut_(adminListApplicationsForJob_(e.parameter));
    if (action === 'adminListCandidates') return jsonOut_(adminListCandidates_(e.parameter.adminKey));
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
    if (action === 'adminLoginGoogle') return jsonOut_(adminLoginGoogle_(e.parameter));
    if (action === 'createJob') return jsonOut_(createJob_(e.parameter));
    if (action === 'updateJob') return jsonOut_(updateJob_(e.parameter));
    if (action === 'setJobFeatured') return jsonOut_(setJobFeatured_(e.parameter));
    if (action === 'requestContact') return jsonOut_(requestContact_(e.parameter));
    if (action === 'matchCandidatesToVacancy') return jsonOut_(matchCandidatesToVacancy_(e.parameter));
    if (action === 'uploadLogo') return jsonOut_(uploadLogo_(e.parameter));
    if (action === 'applyJob') return jsonOut_(applyJob_(e.parameter));
    if (action === 'registerCandidate') return jsonOut_(registerCandidate_(e.parameter));
    if (action === 'uploadCV') return jsonOut_(uploadCV_(e.parameter));
    if (action === 'adminSetPlan') return jsonOut_(adminSetPlan_(e.parameter));
    if (action === 'paypalWebhookConfirmed') return jsonOut_(paypalWebhookConfirmed_(e.parameter));
    if (action === 'adminSetVerificada') return jsonOut_(adminSetVerificada_(e.parameter));
    if (action === 'adminSetEmpresaActive') return jsonOut_(adminSetEmpresaActive_(e.parameter));
    if (action === 'adminSetJobActive') return jsonOut_(adminSetJobActive_(e.parameter));
    if (action === 'adminDeleteJob') return jsonOut_(adminDeleteJob_(e.parameter));
    if (action === 'adminDeleteCandidate') return jsonOut_(adminDeleteCandidate_(e.parameter));
    if (action === 'adminCreateExternalJob') return jsonOut_(adminCreateExternalJob_(e.parameter));
    if (action === 'adminSetTriada') return jsonOut_(adminSetTriada_(e.parameter));
    if (action === 'adminSetReporte') return jsonOut_(adminSetReporte_(e.parameter));
    if (action === 'adminExtractJobFromText') return jsonOut_(adminExtractJobFromText_(e.parameter));
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
    empresaSheet.getRange(rowIndex, empresaHeaders.indexOf('activa') + 1).setValue(true);
  } else {
    appendRowByHeader_(empresaSheet, {
      id: newId_(), razonSocial: 'Empresa Demo — Sintropía Social', rfc: 'DEMO010101AB1',
      verificada: true, activa: true, emailContacto: DEMO_EMPRESA_EMAIL,
      companyToken: DEMO_EMPRESA_TOKEN, plan: 'Pro', logoUrl: '', fecha: new Date().toISOString(),
    });
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
    appendRowByHeader_(candSheet, {
      id: newId_(), nombre: 'David Salgado (Demo)', email: DEMO_CANDIDATO_EMAIL,
      candidateToken: DEMO_CANDIDATO_TOKEN, cvLink: '', fecha: new Date().toISOString(),
    });
  }

  Logger.log('Cuentas demo listas:');
  Logger.log('Empresa  → código: ' + DEMO_EMPRESA_TOKEN + ' (' + DEMO_EMPRESA_EMAIL + ', plan Pro)');
  Logger.log('Candidato → código: ' + DEMO_CANDIDATO_TOKEN + ' (' + DEMO_CANDIDATO_EMAIL + ')');
}

/* ---------- Candidatos de muestra para ver el directorio poblado ----------
   Igual que seedDemoAccounts: NO se llama desde doGet/doPost — solo tú la
   corres a mano desde el editor de Apps Script (menú de funciones → elige
   "seedDemoCandidatesForDirectory" → ▶ Ejecutar).

   Cómo los identificas después: todos usan correos que terminan en
   "@jobmatch-demo.invalid" — ".invalid" es un dominio reservado que nunca
   existe de verdad (no le va a llegar correo a nadie), así que puedes
   buscarlos en el Sheet filtrando por ese texto y borrarlos cuando quieras,
   sin confundirlos jamás con un candidato real. En el directorio público se
   ven igual de anónimos que cualquier otro ("Candidato #XXXX") — nadie más
   que tú, viendo el Sheet, puede saber que son de prueba. */
function seedDemoCandidatesForDirectory() {
  const sheet = getSheet_(SHEET_CANDIDATES);
  const existentes = sheetToObjects_(sheet);
  const yaExisten = existentes.some((c) => (c.email || '').endsWith('@jobmatch-demo.invalid'));
  if (yaExisten) {
    Logger.log('Ya hay candidatos de muestra — no se volvieron a crear. Bórralos a mano en el Sheet si quieres regenerarlos.');
    return;
  }

  const perfiles = [
    'Atención a clientes, ventas, manejo de caja, resolución de conflictos, trabajo en equipo',
    'Excel avanzado, análisis de datos, Power BI, reportes financieros, contabilidad básica',
    'Reclutamiento y selección, entrevistas, onboarding, nómina, clima laboral',
    'JavaScript, React, Node.js, bases de datos SQL, control de versiones Git',
    'Diseño gráfico, Photoshop, Illustrator, identidad de marca, redes sociales',
    'Logística, manejo de inventarios, cadena de suministro, Excel, negociación con proveedores',
    'Redacción, edición de contenido, SEO, marketing digital, redes sociales',
    'Python, análisis de datos, machine learning básico, SQL, visualización de datos',
    'Atención comunitaria, trabajo social, gestión de proyectos sociales, facilitación de talleres',
    'Contabilidad, impuestos, conciliaciones bancarias, Excel avanzado, SAT',
    'Gestión de proyectos, metodologías ágiles, Scrum, liderazgo de equipos, Jira',
    'Ventas B2B, prospección, CRM, negociación, cierre de ventas',
    'Traducción inglés-español, redacción técnica, interpretación, revisión de textos',
    'Soporte técnico, redes, hardware, resolución de incidencias, atención a usuarios',
    'Docencia, diseño curricular, evaluación educativa, facilitación de grupos',
    'Enfermería, atención a pacientes, primeros auxilios, administración de medicamentos',
    'Marketing digital, Google Ads, Meta Ads, analítica web, email marketing',
    'Asistencia legal, redacción de contratos, investigación jurídica, atención a clientes',
    'Ingeniería civil, AutoCAD, supervisión de obra, lectura de planos, presupuestos',
    'Recursos humanos, capacitación, desarrollo organizacional, evaluación de desempeño',
  ];

  perfiles.forEach((habilidades, i) => {
    const n = String(i + 1).padStart(2, '0');
    appendRowByHeader_(sheet, {
      id: newId_(),
      nombre: 'Candidato de Muestra ' + n,
      email: 'demo-candidato-' + n + '@jobmatch-demo.invalid',
      candidateToken: Utilities.getUuid(),
      cvLink: '',
      fecha: new Date().toISOString(),
      habilidades,
    });
  });

  Logger.log('20 candidatos de muestra creados. Búscalos en el Sheet filtrando "@jobmatch-demo.invalid" para borrarlos cuando quieras.');
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
  if (empresa.activa === false) return { error: 'Tu cuenta está desactivada. Contacta a Sintropía Social.' };
  return { companyToken: empresa.companyToken };
}

// Login de administrador vía Google, restringido a una lista blanca de
// correos. Configúrala en Propiedades del script: ADMIN_EMAILS, separando
// varios correos con coma si hace falta más de un admin
// (ej. "sintropiassociales@gmail.com,direccion@sintropiasocial.com").
function adminLoginGoogle_(p) {
  const google = verifyGoogleToken_(p.idToken);
  if (!google) return { error: 'No se pudo verificar tu cuenta de Google. Intenta de nuevo.' };

  const allowedRaw = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '';
  const allowed = allowedRaw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(google.email.toLowerCase())) {
    return { error: 'Tu correo (' + google.email + ') no está autorizado como administrador.' };
  }

  const adminKey = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!adminKey) return { error: 'Falta configurar ADMIN_KEY en Apps Script' };
  return { adminKey };
}

/* ---------- Empresas (cuentas) ---------- */

function getEmpresaByToken_(token) {
  const empresas = sheetToObjects_(getSheet_(SHEET_COMPANIES));
  return empresas.find((c) => c.companyToken === token);
}

function registerEmpresa_(p) {
  if (!p.razonSocial || !p.emailContacto) return { error: 'Falta razón social o correo' };
  if (!isValidRFC_(p.rfc)) return { error: 'El RFC no tiene un formato válido. Revísalo e intenta de nuevo.' };
  if (tooSoon_('reg_empresa_' + p.emailContacto.toLowerCase(), 20)) {
    return { error: 'Ya recibimos tu solicitud hace un momento — espera unos segundos antes de intentar de nuevo.' };
  }

  const sheet = getSheet_(SHEET_COMPANIES);
  const empresas = sheetToObjects_(sheet);
  const existing = empresas.find((c) => c.emailContacto.toLowerCase() === p.emailContacto.toLowerCase() || c.rfc.toUpperCase() === p.rfc.toUpperCase());
  if (existing) return { error: 'Ya existe una cuenta con ese correo o RFC. Usa "Ya tengo cuenta" para entrar.' };

  const id = newId_();
  const companyToken = Utilities.getUuid();
  appendRowByHeader_(sheet, {
    id, razonSocial: p.razonSocial, rfc: p.rfc.toUpperCase(), verificada: false, activa: true,
    emailContacto: p.emailContacto, companyToken, plan: PLAN_FREE, logoUrl: '', fecha: new Date().toISOString(),
  });

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
  if (empresa.activa === false) return { error: 'Tu cuenta está desactivada. Contacta a Sintropía Social.' };

  const jobs = sheetToObjects_(getSheet_(SHEET_JOBS)).filter((j) => String(j.empresaId) === String(empresa.id) && j.activa !== false);
  const applications = sheetToObjects_(getSheet_(SHEET_APPLICATIONS));
  const jobIds = jobs.map((j) => String(j.id));
  const jobsWithCounts = jobs.map((j) => ({
    ...j,
    numPostulaciones: applications.filter((a) => String(a.jobId) === String(j.id)).length,
  }));

  const { companyToken, ...safeEmpresa } = empresa;
  const limit = PLAN_JOB_LIMITS[empresa.plan] ?? 1;

  let publicadasEsteMes = null;
  let limiteMensual = null;
  if (empresa.plan === PLAN_FREE) {
    const allJobsFromEmpresa = sheetToObjects_(getSheet_(SHEET_JOBS)).filter((j) => String(j.empresaId) === String(empresa.id));
    const currentMonth = new Date().toISOString().slice(0, 7);
    publicadasEsteMes = allJobsFromEmpresa.filter((j) => (j.fecha || '').slice(0, 7) === currentMonth).length;
    limiteMensual = FREE_PLAN_MONTHLY_POST_LIMIT;
  }

  const limiteDestacadas = PLAN_FEATURED_MONTHLY_LIMIT[empresa.plan] || null;
  let destacadasEsteMes = null;
  if (limiteDestacadas) {
    const currentMonthF = new Date().toISOString().slice(0, 7);
    destacadasEsteMes = sheetToObjects_(getSheet_(SHEET_JOBS))
      .filter((j) => String(j.empresaId) === String(empresa.id) && (j.destacadaEn || '').slice(0, 7) === currentMonthF).length;
  }

  return {
    empresa: safeEmpresa,
    jobs: jobsWithCounts,
    puedeEditar: PLANS_PAID.includes(empresa.plan),
    puedeSubirLogo: PLANS_PAID.includes(empresa.plan),
    vacantesActivas: jobs.length,
    limiteVacantes: limit === Infinity ? null : limit,
    publicadasEsteMes,
    limiteMensual,
    limiteDestacadas: limiteDestacadas === Infinity ? null : limiteDestacadas,
    puedeDestacar: !!limiteDestacadas,
    destacadasEsteMes,
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
  const logoColIndex = colIndex_(sheet, 'logoUrl');
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

  let filtered = jobs.filter((j) => {
    if (j.activa === false) return false;
    if (j.fuente === 'empresa') {
      const empresa = empresasById[String(j.empresaId)];
      if (!empresa || empresa.activa === false) return false;
    }
    return true;
  });
  if (params.soloDestacadas === 'true') {
    filtered = filtered.filter((j) => j.destacada === true);
  }
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
  if (job.activa === false) return { error: 'Esta vacante ya no está disponible' };
  if (job.fuente === 'empresa') {
    const empresa = empresasById[String(job.empresaId)];
    if (!empresa || empresa.activa === false) return { error: 'Esta vacante ya no está disponible' };
  }
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
  if (empresa.activa === false) return { error: 'Tu cuenta está desactivada. Contacta a Sintropía Social.' };

  const allJobsFromEmpresa = sheetToObjects_(getSheet_(SHEET_JOBS)).filter((j) => String(j.empresaId) === String(empresa.id));
  const active = allJobsFromEmpresa.filter((j) => j.activa !== false);
  const limit = PLAN_JOB_LIMITS[empresa.plan] ?? 1;
  if (active.length >= limit) {
    return { error: `Tu plan (${empresa.plan}) permite hasta ${limit} vacante(s) activa(s). Mejora tu plan desde tu cuenta para publicar más.` };
  }

  // El plan Gratis, además del límite de activas, solo permite publicar
  // 2 vacantes nuevas por mes calendario (cuenten como activas o no).
  if (empresa.plan === PLAN_FREE) {
    const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const publicadasEsteMes = allJobsFromEmpresa.filter((j) => (j.fecha || '').slice(0, 7) === currentMonth).length;
    if (publicadasEsteMes >= FREE_PLAN_MONTHLY_POST_LIMIT) {
      return { error: `El plan Gratis permite publicar hasta ${FREE_PLAN_MONTHLY_POST_LIMIT} vacantes por mes. Mejora tu plan desde tu cuenta para publicar más este mes.` };
    }
  }

  const sheet = getSheet_(SHEET_JOBS);
  const id = newId_();
  appendRowByHeader_(sheet, {
    id, empresaId: empresa.id, fuente: 'empresa', empresaNombre: empresa.razonSocial,
    titulo: p.titulo || '', modalidad: p.modalidad || '', ubicacion: p.ubicacion || '',
    salarioMin: p.salarioMin || '', salarioMax: p.salarioMax || '', descripcion: p.descripcion || '',
    fecha: new Date().toISOString(), destacada: false, activa: true, linkExterno: '', notaAdmin: '',
  });

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

  const editableFields = ['titulo', 'modalidad', 'ubicacion', 'salarioMin', 'salarioMax', 'descripcion'];
  editableFields.forEach((field) => {
    if (p[field] !== undefined) {
      sheet.getRange(rowIndex + 2, colIndex_(sheet, field)).setValue(p[field]);
    }
  });

  return { ok: true };
}

// Destacar/quitar destacada. Cada plan tiene un tope de cuántas vacantes
// puede destacar POR MES (no cuántas puede tener destacadas a la vez).
function setJobFeatured_(p) {
  const empresa = getEmpresaByToken_(p.companyToken);
  if (!empresa) return { error: 'No autorizado' };
  const limiteMensual = PLAN_FEATURED_MONTHLY_LIMIT[empresa.plan];
  if (!limiteMensual) return { error: 'Destacar vacantes no está incluido en tu plan actual. Mejora tu plan desde tu cuenta.' };

  const sheet = getSheet_(SHEET_JOBS);
  const jobs = sheetToObjects_(sheet);
  const rowIndex = jobs.findIndex((j) => String(j.id) === String(p.jobId) && String(j.empresaId) === String(empresa.id));
  if (rowIndex < 0) return { error: 'Vacante no encontrada' };

  const activar = p.destacada === 'true';
  if (activar) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const usadasEsteMes = jobs.filter((j) => String(j.empresaId) === String(empresa.id) && (j.destacadaEn || '').slice(0, 7) === currentMonth).length;
    if (usadasEsteMes >= limiteMensual) {
      return { error: `Tu plan (${empresa.plan}) permite destacar hasta ${limiteMensual} vacante(s) por mes, y ya usaste ese límite este mes.` };
    }
    sheet.getRange(rowIndex + 2, colIndex_(sheet, 'destacadaEn')).setValue(new Date().toISOString());
  }
  sheet.getRange(rowIndex + 2, colIndex_(sheet, 'destacada')).setValue(activar);

  return { ok: true };
}

/* ---------- Vacantes externas (agregadas por admin, sin postulación interna) ---------- */

// Nivel 1 de automatización: el admin pega el texto crudo de una vacante
// (de LinkedIn, un correo, donde sea) y Gemini lo estructura en los campos
// que usa el formulario. El admin sigue revisando y publicando a mano.
function adminExtractJobFromText_(p) {
  if (!checkAdmin_(p.adminKey)) return { error: 'No autorizado' };
  if (!p.rawText) return { error: 'Falta el texto de la vacante' };

  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { error: 'Falta configurar GEMINI_API_KEY en Apps Script (Propiedades del script)' };

  const prompt = `Extrae los datos de esta vacante de empleo y responde ÚNICAMENTE con un JSON válido, sin texto adicional, con este formato exacto (usa "" si no encuentras un dato, y null para los números que no encuentres):
{"empresa":"","titulo":"","modalidad":"Remoto|Híbrido|Presencial|","ubicacion":"","salarioMin":null,"salarioMax":null,"descripcion":"","linkExterno":""}

Instrucciones:
- "modalidad" debe ser exactamente una de: Remoto, Híbrido, Presencial, o "" si no se puede inferir.
- "descripcion": redacta 2-4 líneas basadas ÚNICAMENTE en lo que el texto realmente dice sobre el puesto (responsabilidades, requisitos, experiencia pedida, beneficios). Extrae y aprovecha cualquier detalle presente, por mínimo que sea — NUNCA escribas comentarios sobre la fuente o sobre información faltante (evita frases como "vacante publicada sin descripción detallada" o "se requiere consultar el enlace externo"). Si el texto es muy corto, simplemente resume lo poco que haya en tono directo, sin explicar que es poco.
- "linkExterno" solo si el texto trae una URL explícita; si no hay ninguna, deja "".
- Los sueldos van en pesos mexicanos si no se especifica otra moneda; si no hay sueldo, usa null.

TEXTO DE LA VACANTE:
${p.rawText}`;

  const res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': apiKey },
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
      muteHttpExceptions: true,
    }
  );

  if (res.getResponseCode() !== 200) return { error: 'Error de Gemini: ' + res.getContentText() };

  const data = JSON.parse(res.getContentText());
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  let extracted;
  try {
    extracted = JSON.parse(content);
  } catch (e) {
    return { error: 'La IA no devolvió un JSON válido. Intenta con menos texto o revisa manualmente.' };
  }

  return { extracted };
}

function adminCreateExternalJob_(p) {
  if (!checkAdmin_(p.adminKey)) return { error: 'No autorizado' };
  if (!p.linkExterno) return { error: 'Falta el link de la vacante original' };
  const linkExterno = /^https?:\/\//i.test(p.linkExterno) ? p.linkExterno : `https://${p.linkExterno}`;

  const sheet = getSheet_(SHEET_JOBS);
  const id = newId_();
  appendRowByHeader_(sheet, {
    id, empresaId: '', fuente: 'admin', empresaNombre: p.empresaNombre || 'Vacante externa',
    titulo: p.titulo || '', modalidad: p.modalidad || '', ubicacion: p.ubicacion || '',
    salarioMin: p.salarioMin || '', salarioMax: p.salarioMax || '', descripcion: p.descripcion || '',
    fecha: new Date().toISOString(), destacada: false, activa: true, linkExterno,
    notaAdmin: p.notaAdmin || 'Sin relación directa con la vacante — solo referencia informativa.',
  });

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
    appendRowByHeader_(sheet, {
      id: candidateId, nombre: p.nombre || '', email: p.email || '',
      candidateToken, cvLink: p.cvLink || '', fecha: new Date().toISOString(),
      habilidades: p.habilidades || '',
    });
  }

  if (candidate && rowIndex) {
    if (p.nombre) sheet.getRange(rowIndex, colIndex_(sheet, 'nombre')).setValue(p.nombre);
    if (p.cvLink) sheet.getRange(rowIndex, colIndex_(sheet, 'cvLink')).setValue(p.cvLink);
    if (p.habilidades !== undefined) sheet.getRange(rowIndex, colIndex_(sheet, 'habilidades')).setValue(p.habilidades);
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

// Directorio anónimo de candidatos — cualquier empresa con sesión activa
// puede navegarlo, sin importar su plan. Deliberadamente NUNCA incluye
// nombre, email, teléfono, cvLink, ni nada del perfil socioeconómico —
// eso solo se revela candidato por candidato, si él autoriza una solicitud
// de contacto (ver requestContact_).
function listCandidatesDirectory_(p) {
  const empresa = getEmpresaByToken_(p.companyToken);
  if (!empresa) return { error: 'No autorizado' };

  const misSolicitudes = sheetToObjects_(getSheet_(SHEET_CONTACT_REQUESTS)).filter((r) => r.companyToken === p.companyToken);
  const solicitudPorCandidato = {};
  misSolicitudes.forEach((r) => (solicitudPorCandidato[String(r.candidatoId)] = r.estado));

  const candidatos = sheetToObjects_(getSheet_(SHEET_CANDIDATES));
  let items = candidatos
    .filter((c) => (c.habilidades || '').trim() !== '') // sin habilidades no hay nada que mostrar/comparar
    .map((c) => ({
      candidatoId: c.id,
      apodo: 'Candidato #' + String(c.id).slice(-4).toUpperCase(),
      habilidades: c.habilidades,
      estadoSolicitud: solicitudPorCandidato[String(c.id)] || null,
    }));

  if (p.q) {
    const q = p.q.toLowerCase();
    items = items.filter((c) => c.habilidades.toLowerCase().includes(q));
  }

  return { items, puedeSolicitarContacto: PLANS_WITH_SOCIOECONOMIC_ACCESS.includes(empresa.plan) };
}

/* ---------- Comparar candidatos contra una vacante (Fase 3) ---------- */

// Cuenta traslapes de palabras entre dos listas de habilidades separadas
// por coma — sin llamar a la IA por candidato, para que sea rápido y barato
// sin importar cuántos candidatos haya, y para que el criterio sea objetivo
// y auditable (no una "caja negra").
function skillOverlapScore_(candidateSkills, vacancySkills) {
  const norm = (s) => (s || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
  const cSet = norm(candidateSkills);
  const vSet = norm(vacancySkills);
  if (cSet.length === 0 || vSet.length === 0) return 0;
  let matches = 0;
  cSet.forEach((c) => {
    if (vSet.some((v) => v.includes(c) || c.includes(v))) matches++;
  });
  return Math.min(100, Math.round((matches / vSet.length) * 100));
}

// Extrae, con UNA sola llamada a Gemini, las habilidades/competencias que
// pide un texto de vacante — y con eso compara (sin IA) contra cada
// candidato del directorio.
function matchCandidatesToVacancy_(p) {
  const empresa = getEmpresaByToken_(p.companyToken);
  if (!empresa) return { error: 'No autorizado' };

  let textoVacante = p.texto || '';
  if (p.jobId) {
    const job = getJobRaw_(p.jobId);
    if (job) textoVacante = `${job.titulo}\n${job.descripcion}`;
  }
  if (!textoVacante.trim()) return { error: 'Falta el texto o la vacante a comparar' };

  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { error: 'Falta configurar GEMINI_API_KEY en Apps Script (Propiedades del script)' };

  const prompt = `Lee esta descripción de vacante y extrae SOLO las habilidades y competencias clave que pide, como una lista separada por comas (sin numeración, sin explicación adicional). Responde ÚNICAMENTE con un JSON: {"habilidades": "habilidad1, habilidad2, habilidad3"}

TEXTO DE LA VACANTE:
${textoVacante}`;

  const res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': apiKey },
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
      muteHttpExceptions: true,
    }
  );
  if (res.getResponseCode() !== 200) return { error: 'Error de Gemini: ' + res.getContentText() };

  const data = JSON.parse(res.getContentText());
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  let extracted;
  try {
    extracted = JSON.parse(content);
  } catch (e) {
    return { error: 'La IA no pudo leer esa vacante. Intenta con un texto más claro.' };
  }
  const habilidadesVacante = extracted.habilidades || '';

  const directorio = listCandidatesDirectory_(p);
  if (directorio.error) return directorio;

  const items = directorio.items
    .map((c) => ({ ...c, score: skillOverlapScore_(c.habilidades, habilidadesVacante) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  return { items, habilidadesVacante, puedeSolicitarContacto: directorio.puedeSolicitarContacto };
}

/* ---------- Solicitud de contacto (Fase 4) ---------- */

// Solo empresas Business/A la medida pueden pedirle a un candidato ver sus
// datos. Se manda un correo con dos links (sí/no) — el candidato decide.
function requestContact_(p) {
  const empresa = getEmpresaByToken_(p.companyToken);
  if (!empresa) return { error: 'No autorizado' };
  if (!PLANS_WITH_SOCIOECONOMIC_ACCESS.includes(empresa.plan)) {
    return { error: 'Solicitar contacto es una función de los planes Business y A la medida.' };
  }

  const candidatos = sheetToObjects_(getSheet_(SHEET_CANDIDATES));
  const candidato = candidatos.find((c) => String(c.id) === String(p.candidatoId));
  if (!candidato) return { error: 'Candidato no encontrado' };

  const sheet = getSheet_(SHEET_CONTACT_REQUESTS);
  const existentes = sheetToObjects_(sheet);
  const yaExiste = existentes.find((r) => String(r.candidatoId) === String(p.candidatoId) && r.companyToken === p.companyToken);
  if (yaExiste) return { error: 'Ya le mandaste una solicitud a este candidato antes.', estado: yaExiste.estado };

  const requestId = newId_() + newId_(); // más largo, porque este ID hace de "contraseña" en el link de correo
  appendRowByHeader_(sheet, {
    id: requestId, candidatoId: p.candidatoId, empresaId: empresa.id, companyToken: p.companyToken,
    empresaNombre: empresa.razonSocial, estado: 'pendiente', fecha: new Date().toISOString(),
  });

  const baseUrl = ScriptApp.getService().getUrl();
  const linkSi = `${baseUrl}?action=respondContactRequest&requestId=${requestId}&respuesta=si`;
  const linkNo = `${baseUrl}?action=respondContactRequest&requestId=${requestId}&respuesta=no`;

  try {
    MailApp.sendEmail({
      to: candidato.email,
      subject: `${empresa.razonSocial} quiere ver tu información en JobMatch Pro`,
      body:
        `Hola,\n\nLa empresa "${empresa.razonSocial}" encontró tu perfil en el directorio de habilidades de ` +
        `JobMatch Pro y quiere ver tu información de contacto (nombre, correo, CV) para posiblemente invitarte a una entrevista.\n\n` +
        `Tú decides — no compartimos nada sin tu autorización:\n\n` +
        `Sí, autorizo: ${linkSi}\n\n` +
        `No, gracias: ${linkNo}\n\n` +
        `Si no reconoces esta empresa o prefieres no compartir tu información, simplemente ignora este correo o da clic en "No".\n\n` +
        `— JobMatch Pro, un proyecto de Sintropía Social`,
    });
  } catch (mailErr) {
    return { error: 'No se pudo enviar el correo al candidato. Intenta de nuevo.' };
  }

  return { ok: true };
}

// Página pública que ve el candidato al darle clic al link de su correo.
// No requiere ADMIN_KEY ni companyToken — el propio requestId (un UUID
// largo, imposible de adivinar) es lo que autentica esta acción.
function respondContactRequestPage_(p) {
  const sheet = getSheet_(SHEET_CONTACT_REQUESTS);
  const solicitudes = sheetToObjects_(sheet);
  const rowIndex = solicitudes.findIndex((r) => String(r.id) === String(p.requestId));

  let mensaje;
  if (rowIndex < 0) {
    mensaje = 'Este link ya no es válido o ya fue usado.';
  } else {
    const nuevoEstado = p.respuesta === 'si' ? 'autorizado' : 'rechazado';
    sheet.getRange(rowIndex + 2, colIndex_(sheet, 'estado')).setValue(nuevoEstado);
    mensaje = nuevoEstado === 'autorizado'
      ? 'Listo — autorizaste que esa empresa vea tu información de contacto. Puede que te escriban pronto.'
      : 'Entendido — no vamos a compartir tu información con esa empresa.';
  }

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JobMatch Pro</title>
    <style>body{font-family:sans-serif;background:#FAF9F7;color:#1A1523;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}
    .box{background:#fff;border-radius:20px;padding:36px;max-width:420px;box-shadow:0 12px 32px rgba(30,10,71,.12)}
    h1{color:#6B21F5;font-size:1.3rem}</style></head>
    <body><div class="box"><h1>JobMatch Pro</h1><p>${mensaje}</p></div></body></html>`;
  return HtmlService.createHtmlOutput(html);
}

// Solo revela nombre/correo/teléfono/CV si existe una solicitud 'autorizada'
// de esta empresa específica para este candidato específico.
function getCandidateContactInfo_(p) {
  const empresa = getEmpresaByToken_(p.companyToken);
  if (!empresa) return { error: 'No autorizado' };

  const solicitudes = sheetToObjects_(getSheet_(SHEET_CONTACT_REQUESTS));
  const solicitud = solicitudes.find((r) => String(r.candidatoId) === String(p.candidatoId) && r.companyToken === p.companyToken);
  if (!solicitud || solicitud.estado !== 'autorizado') {
    return { error: 'Este candidato no ha autorizado compartir su contacto contigo.' };
  }

  const candidatos = sheetToObjects_(getSheet_(SHEET_CANDIDATES));
  const candidato = candidatos.find((c) => String(c.id) === String(p.candidatoId));
  if (!candidato) return { error: 'Candidato no encontrado' };

  return { nombre: candidato.nombre, email: candidato.email, cvLink: candidato.cvLink || '' };
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
  if (tooSoon_('apply_' + (p.email || '').toLowerCase() + '_' + p.jobId, 15)) {
    return { error: 'Ya recibimos tu postulación a esta vacante hace un momento.' };
  }

  const candidateResult = registerCandidate_({ nombre: p.nombre, email: p.email, cvLink: p.cvLink });

  const sheet = getSheet_(SHEET_APPLICATIONS);
  const id = newId_();
  appendRowByHeader_(sheet, {
    id, jobId: p.jobId || '', candidatoId: candidateResult.id, nombre: p.nombre || '',
    email: p.email || '', telefono: p.telefono || '', perfil: p.perfil || '',
    matchScore: p.matchScore || '', autorizoSocioeconomico: p.autorizoSocioeconomico === 'true',
    fecha: new Date().toISOString(),
  });

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
  if (adminLockoutActive_()) return { error: 'Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentar.' };
  if (!checkAdmin_(adminKey)) return { error: 'No autorizado' };
  return { items: sheetToObjects_(getSheet_(SHEET_COMPANIES)) };
}

function adminSetPlan_(p) {
  if (!checkAdmin_(p.adminKey)) return { error: 'No autorizado' };
  const sheet = getSheet_(SHEET_COMPANIES);
  const empresas = sheetToObjects_(sheet);
  const rowIndex = empresas.findIndex((c) => c.companyToken === p.companyToken);
  if (rowIndex < 0) return { error: 'Empresa no encontrada' };
  sheet.getRange(rowIndex + 2, colIndex_(sheet, 'plan')).setValue(p.plan);
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
  sheet.getRange(rowIndex + 2, colIndex_(sheet, 'plan')).setValue(p.plan);

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
  sheet.getRange(rowIndex + 2, colIndex_(sheet, 'verificada')).setValue(p.verificada === 'true');
  return { ok: true };
}

// Dar de alta/baja una empresa. Una empresa desactivada no puede entrar a su
// cuenta, publicar vacantes nuevas, y sus vacantes existentes se ocultan del
// listado público (pero no se borran, por si se reactiva después).
function adminSetEmpresaActive_(p) {
  if (!checkAdmin_(p.adminKey)) return { error: 'No autorizado' };
  const sheet = getSheet_(SHEET_COMPANIES);
  const empresas = sheetToObjects_(sheet);
  const rowIndex = empresas.findIndex((c) => c.companyToken === p.companyToken);
  if (rowIndex < 0) return { error: 'Empresa no encontrada' };
  sheet.getRange(rowIndex + 2, colIndex_(sheet, 'activa')).setValue(p.activa === 'true');
  return { ok: true };
}

/* ---------- Administración de vacantes (todas, sin importar la fuente) ---------- */

/* ---------- Curaduría (triada de candidatos, planes Pro en adelante) ---------- */

// Devuelve las postulaciones de una vacante específica, con el correo/nombre
// del candidato — para que el admin (Sintropía) pueda elegir la triada.
function adminListApplicationsForJob_(p) {
  if (!checkAdmin_(p.adminKey)) return { error: 'No autorizado' };
  const applications = sheetToObjects_(getSheet_(SHEET_APPLICATIONS));
  const items = applications.filter((a) => String(a.jobId) === String(p.jobId));
  return { items };
}

// Marca/desmarca a un candidato como parte de la triada de una vacante.
// No pone un límite duro de 3 aquí — el admin es de confianza y el límite
// real (2 vs 5 vs ilimitado) se cobra y se acuerda fuera de la plataforma;
// esto es una herramienta de registro, no un candado de negocio.
function adminSetTriada_(p) {
  if (!checkAdmin_(p.adminKey)) return { error: 'No autorizado' };
  const sheet = getSheet_(SHEET_APPLICATIONS);
  const applications = sheetToObjects_(sheet);
  const rowIndex = applications.findIndex((a) => String(a.id) === String(p.applicationId));
  if (rowIndex < 0) return { error: 'Postulación no encontrada' };
  sheet.getRange(rowIndex + 2, colIndex_(sheet, 'enTriada')).setValue(p.enTriada === 'true');
  return { ok: true };
}

// Guarda/edita el texto del reporte (entrevista inicial, competencias, etc.)
// de un candidato específico.
function adminSetReporte_(p) {
  if (!checkAdmin_(p.adminKey)) return { error: 'No autorizado' };
  const sheet = getSheet_(SHEET_APPLICATIONS);
  const applications = sheetToObjects_(sheet);
  const rowIndex = applications.findIndex((a) => String(a.id) === String(p.applicationId));
  if (rowIndex < 0) return { error: 'Postulación no encontrada' };
  sheet.getRange(rowIndex + 2, colIndex_(sheet, 'reporteAdmin')).setValue(p.reporte || '');
  return { ok: true };
}

function adminListAllJobs_(adminKey) {
  if (!checkAdmin_(adminKey)) return { error: 'No autorizado' };
  return { items: sheetToObjects_(getSheet_(SHEET_JOBS)) };
}

// Pausar/reactivar una vacante sin borrarla — útil para "bajar" una vacante
// temporalmente (ej. la empresa ya cerró el puesto) sin perder sus datos ni
// sus postulaciones.
function adminSetJobActive_(p) {
  if (!checkAdmin_(p.adminKey)) return { error: 'No autorizado' };
  const sheet = getSheet_(SHEET_JOBS);
  const jobs = sheetToObjects_(sheet);
  const rowIndex = jobs.findIndex((j) => String(j.id) === String(p.jobId));
  if (rowIndex < 0) return { error: 'Vacante no encontrada' };
  sheet.getRange(rowIndex + 2, colIndex_(sheet, 'activa')).setValue(p.activa === 'true');
  return { ok: true };
}

// Borrado permanente de una vacante (y sus postulaciones asociadas).
function adminDeleteJob_(p) {
  if (!checkAdmin_(p.adminKey)) return { error: 'No autorizado' };
  const sheet = getSheet_(SHEET_JOBS);
  const jobs = sheetToObjects_(sheet);
  const rowIndex = jobs.findIndex((j) => String(j.id) === String(p.jobId));
  if (rowIndex < 0) return { error: 'Vacante no encontrada' };
  sheet.deleteRow(rowIndex + 2);

  const appSheet = getSheet_(SHEET_APPLICATIONS);
  const applications = sheetToObjects_(appSheet);
  // Borra de abajo hacia arriba para no desfasar los índices de fila al eliminar
  for (let i = applications.length - 1; i >= 0; i--) {
    if (String(applications[i].jobId) === String(p.jobId)) {
      appSheet.deleteRow(i + 2);
    }
  }
  return { ok: true };
}

/* ---------- Administración de candidatos ---------- */

function adminListCandidates_(adminKey) {
  if (!checkAdmin_(adminKey)) return { error: 'No autorizado' };
  const candidatos = sheetToObjects_(getSheet_(SHEET_CANDIDATES));
  const applications = sheetToObjects_(getSheet_(SHEET_APPLICATIONS));
  const items = candidatos.map((c) => ({
    ...c,
    candidateToken: undefined, // no exponer el código de acceso del candidato al listado
    numPostulaciones: applications.filter((a) => String(a.candidatoId) === String(c.id)).length,
  }));
  return { items };
}

// Borrado permanente del candidato y todo lo asociado a él (postulaciones,
// perfil socioeconómico) — pensado para solicitudes de baja de datos
// personales, no solo para "desactivar".
function adminDeleteCandidate_(p) {
  if (!checkAdmin_(p.adminKey)) return { error: 'No autorizado' };

  const candSheet = getSheet_(SHEET_CANDIDATES);
  const candidatos = sheetToObjects_(candSheet);
  const rowIndex = candidatos.findIndex((c) => String(c.id) === String(p.candidatoId));
  if (rowIndex < 0) return { error: 'Candidato no encontrado' };
  candSheet.deleteRow(rowIndex + 2);

  const socioSheet = getSheet_(SHEET_SOCIOECONOMIC);
  const socios = sheetToObjects_(socioSheet);
  for (let i = socios.length - 1; i >= 0; i--) {
    if (String(socios[i].candidatoId) === String(p.candidatoId)) socioSheet.deleteRow(i + 2);
  }

  const appSheet = getSheet_(SHEET_APPLICATIONS);
  const applications = sheetToObjects_(appSheet);
  for (let i = applications.length - 1; i >= 0; i--) {
    if (String(applications[i].candidatoId) === String(p.candidatoId)) appSheet.deleteRow(i + 2);
  }

  return { ok: true };
}

/* ---------- Pagos y facturación ---------- */

function billingReceipt_(p) {
  const sheet = getSheet_(SHEET_PAYMENTS);
  appendRowByHeader_(sheet, {
    fecha: new Date().toISOString(), plan: p.plan || '', subscriptionId: p.subscriptionId || '',
    payerName: p.payerName || '', payerEmail: p.payerEmail || '', razonSocial: p.razonSocial || '',
    rfc: p.rfc || '', direccionFiscal: p.direccionFiscal || '', usoCFDI: p.usoCFDI || '',
    companyEmail: p.companyEmail || '',
  });

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
