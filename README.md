# JobMatch Pro — versión ligera

MVP de JobMatch Pro sin servidores propios: GitHub Pages + Google Sheets/Apps
Script como base de datos + Cloudflare Worker para el matching por IA + PayPal
para suscripciones. Mismo patrón que tus otros proyectos de Sintropía Social /
Escuela SER.

## Estructura

```
jobmatch-lite/
├── index.html                 Landing
├── vacantes.html               Búsqueda y listado de vacantes
├── vacante.html                 Detalle + postulación + afinidad IA + consentimiento socioeconómico
├── publicar-vacante.html       Formulario para empresas
├── precios.html                 Planes + botones de suscripción PayPal + facturación
├── admin.html                    Panel de empresa (por token) — postulaciones y perfil socioeconómico autorizado
├── admin-plataforma.html        Panel interno Sintropía — activar planes tras confirmar pago
├── candidato.html                Portal del candidato: CV, perfil socioeconómico privado, mis postulaciones
├── assets/
│   ├── css/style.css           Sistema visual (marca Sintropía Social)
│   └── js/app.js                Config + helpers de API
├── apps-script/Code.gs          Backend (Google Sheets + Drive)
├── cloudflare-worker/worker.js Proxy de IA (OpenAI)
└── docs/
    ├── SETUP-GUIDE.md          Instalación paso a paso (incluye subir a GitHub)
    └── CUANDO-ESCALAR.md       Umbrales para migrar a la versión completa
```

## Quiénes tienen acceso a qué

| Rol | Cómo entra | Qué puede ver |
|---|---|---|
| **Candidato** | Crea perfil con su correo → recibe un código de acceso | Su propio CV, su perfil socioeconómico privado, sus postulaciones |
| **Empresa** | Recibe un `companyToken` al publicar su primera vacante | Sus vacantes, sus postulaciones, y el perfil socioeconómico de un candidato **solo si**: (a) su plan es Business o A la medida, **y** (b) el candidato autorizó explícitamente compartirlo en esa postulación |
| **Admin (tú)** | `ADMIN_KEY` que configuras en Apps Script | Todas las empresas y sus planes, para activarlos tras confirmar un pago |

Los datos socioeconómicos **nunca** se muestran por default — es opt-in del
candidato, por vacante, y solo visibles según el plan de la empresa.

## Antes de publicar

Sigue `docs/SETUP-GUIDE.md` completo (Sheet → Apps Script → Cloudflare Worker
→ PayPal → GitHub Pages) y reemplaza los placeholders `PEGA_AQUI_...` en
`assets/js/app.js`.

## Cuándo esto deja de ser suficiente

Lee `docs/CUANDO-ESCALAR.md` — tiene números concretos (empresas pagando,
postulaciones/mes, límites de cuota de Apps Script) para saber cuándo migrar
a la versión completa (`jobmatch-pro/`, ya armada con Render + Vercel +
PostgreSQL).
