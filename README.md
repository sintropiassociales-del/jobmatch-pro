# JobMatch Pro — versión ligera

MVP de JobMatch Pro sin servidores propios: GitHub Pages + Google Sheets/Apps
Script como base de datos + Cloudflare Worker para el matching por IA + PayPal
para suscripciones. Mismo patrón que tus otros proyectos de Sintropía Social /
Escuela SER.

## Estructura

```
jobmatch-lite/
├── index.html                 Landing
├── vacantes.html               Búsqueda y listado (empresas primero, externas después)
├── vacante.html                 Detalle: postulación+IA (empresa) o link de salida (externa)
├── registro-empresa.html       Alta de cuenta de empresa (con RFC)
├── portal-empresa.html          Cuenta de empresa: publicar, editar, postulaciones, plan y pago
├── precios.html                 Planes (informativo — el pago va dentro de la cuenta)
├── candidato.html                Portal del candidato: CV, perfil socioeconómico privado
├── admin-plataforma.html        Panel interno Sintropía: planes, RFC verificado, vacantes externas
├── assets/
│   ├── css/style.css           Sistema visual (marca Sintropía Social)
│   └── js/app.js                Config + helpers de API
├── apps-script/Code.gs          Backend (Google Sheets + Drive)
├── cloudflare-worker/
│   ├── worker.js                 Proxy de IA para matching (Google Gemini, gratis)
│   └── paypal-webhook-worker.js Verifica webhooks de PayPal y activa planes solo
└── docs/
    ├── SETUP-GUIDE.md          Instalación paso a paso (incluye subir a GitHub)
    └── CUANDO-ESCALAR.md       Umbrales para migrar a la versión completa
```

## Cómo funcionan las cuentas de empresa

1. La empresa se registra gratis en `registro-empresa.html` con razón social,
   **RFC** (se valida el formato como señal de verificación) y correo.
2. Recibe un código de acceso por correo y entra a `portal-empresa.html`.
3. Desde ahí, con su cuenta ya identificada (sin pegar tokens sueltos en una
   página pública): publica vacantes, las edita (si su plan lo permite), ve
   postulaciones, sube su logo, y **paga y mejora su plan con PayPal desde la
   pestaña "Mi plan"**.
4. Si configuraste el webhook de PayPal (`docs/SETUP-GUIDE.md`, sección 4),
   el plan se activa **solo**, en segundos, sin que tú intervengas — y se
   regresa a "Gratis" automáticamente si la empresa cancela. Sin ese webhook,
   sigue funcionando igual pero activas el plan a mano en
   `admin-plataforma.html`.
4. Plan **Gratis** (por default): 1 vacante activa, sin edición, sin logo.
   Planes de pago (Starter/Pro/Business/A la medida): más vacantes, edición
   libre, logo, y Business/A la medida además desbloquean el acceso a datos
   socioeconómicos (solo si el candidato autorizó).

## Dos fuentes de vacantes

- **`fuente: "empresa"`** — publicadas desde `portal-empresa.html`. Tienen
  postulación interna, matching por IA, logo si el plan lo permite. **Siempre
  se listan primero.**
- **`fuente: "admin"`** — las agregas tú desde `admin-plataforma.html` cuando
  ves una vacante en otro sitio y quieres listarla como referencia (puedes
  pegar el texto crudo y usar "Extraer con IA" para no llenar los campos a
  mano). No tienen postulación interna ni logo — solo descripción general +
  un botón que manda al link original, con la nota "Sin relación directa con
  la vacante". Siempre se listan **después** de las de empresas registradas.

## Quiénes tienen acceso a qué

| Rol | Cómo entra | Qué puede ver |
|---|---|---|
| **Candidato** | Crea perfil con su correo → código de acceso | Su CV, su perfil socioeconómico privado, sus postulaciones |
| **Empresa** | Se registra con RFC → código de acceso | Sus vacantes, sus postulaciones, su plan y facturación; perfil socioeconómico de un candidato solo si su plan es Business/A la medida **y** el candidato autorizó esa postulación específica |
| **Admin (tú)** | `ADMIN_KEY` configurado en Apps Script | Todas las empresas (para subir su plan tras confirmar un pago y marcar RFC verificado) y puede publicar vacantes externas |

## Antes de publicar

Sigue `docs/SETUP-GUIDE.md` completo y reemplaza los placeholders
`PEGA_AQUI_...` en `assets/js/app.js`.

## Cuándo esto deja de ser suficiente

Lee `docs/CUANDO-ESCALAR.md` para los umbrales concretos de migración a la
versión completa (`jobmatch-pro/`, con Render + Vercel + PostgreSQL).
