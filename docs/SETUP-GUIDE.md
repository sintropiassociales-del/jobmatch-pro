# 🚀 Guía de instalación — JobMatch Pro (versión ligera)

## 1. Crear el Google Sheet

1. Crea un Google Sheet nuevo, llámalo `JobMatch Pro - Base de Datos`.
2. No necesitas crear las hojas a mano — `Code.gs` las crea solas la primera
   vez que se usan: `Empresas`, `Vacantes`, `Postulaciones`, `Candidatos`,
   `PerfilSocioeconomico`, `PagosEmpresas`, `SolicitudesContacto`.
3. **Auto-reparación de columnas**: si en el futuro actualizas `Code.gs` y
   agrega un campo nuevo a alguna hoja, no hace falta que edites el Sheet a
   mano — la primera vez que ese campo se use, el código agrega la columna
   que falte solo, al final de la hoja. Esto fue un arreglo importante:
   antes, cada campo nuevo que agregábamos requería ir al Sheet a insertar la
   columna manualmente, y era fácil que se desalineara.

## 2. Instalar el backend (Apps Script)

1. En el Sheet: **Extensiones → Apps Script**.
2. Borra el contenido de `Code.gs` que viene por default y pega el contenido
   de `apps-script/Code.gs` de este proyecto. Guarda.

### 2.1 Configura tu clave de administrador (ADMIN_KEY)

1. Ícono de engrane ⚙️ **Configuración del proyecto → Propiedades del script
   → Añadir propiedad de script**.
2. Nombre: `ADMIN_KEY`. Valor: una contraseña larga que solo tú conozcas.
   Esta sigue funcionando como respaldo aunque configures Google abajo.

### 2.1.1 (Opcional) Entra como admin con tu correo de Google, sin contraseña

Requiere que ya tengas configurado `GOOGLE_CLIENT_ID` (sección 2.2, más
abajo) — si todavía no llegas ahí, puedes regresar a esto después.

1. Misma pantalla de Propiedades del script → **Añadir propiedad**.
2. Nombre: `ADMIN_EMAILS`. Valor: el o los correos de Google autorizados como
   administrador, separados por coma si son varios (ej.
   `sintropiassociales@gmail.com,direccion@sintropiasocial.com`).
3. Guarda.

Con esto, en `admin-plataforma.html` puedes darle clic a "Entrar con Google"
en vez de escribir la clave — el sistema verifica tu correo real de Google
contra esta lista antes de dejarte entrar. La clave (`ADMIN_KEY`) sigue
funcionando también, por si algún día no tienes acceso a esa cuenta de
Google.

### 2.2 Configura "Entrar con Google" (opcional pero recomendado)

Esto permite que las empresas se registren/entren verificando su correo con
Google, en vez de escribirlo a mano o pegar un código.

1. Ve a [console.cloud.google.com](https://console.cloud.google.com) (con la
   misma cuenta de Google del Sheet) → crea un proyecto nuevo (o usa uno que
   ya tengas) → nómbralo, ej. "JobMatch Pro".
2. Menú lateral → **APIs & Services → OAuth consent screen**.
   - User type: **External**.
   - Llena nombre de la app, tu correo de soporte, y guarda (los demás campos
     puedes dejarlos por default para empezar).
3. Menú lateral → **APIs & Services → Credentials → Create Credentials →
   OAuth client ID**.
   - Application type: **Web application**.
   - En **"Authorized JavaScript origins"**, agrega la URL de tu sitio en
     GitHub Pages, ej. `https://tu-usuario.github.io` (sin nada después del
     dominio).
   - Dale **Create**. Te muestra un **Client ID** (termina en
     `.apps.googleusercontent.com`) — cópialo.
4. Pégalo en **dos** lugares:
   - `assets/js/app.js` → `const GOOGLE_CLIENT_ID = "..."`.
   - Apps Script → ⚙️ Configuración del proyecto → Propiedades del script →
     añade `GOOGLE_CLIENT_ID` con el mismo valor (Apps Script lo usa para
     confirmar que el token de verificación viene de tu app y no de otra).

> Si no quieres configurar esto todavía, no pasa nada — el registro y login
> con código por correo (`registro-empresa.html` / `portal-empresa.html`)
> sigue funcionando igual, el botón de Google es una alternativa, no un
> reemplazo obligatorio.

### 2.3 Activa "Extraer con IA" para vacantes externas (opcional)

Esto le permite a `admin-plataforma.html` leer el texto que pegues de una
vacante (de LinkedIn, un correo, donde sea) y llenar los campos solo, usando
la misma cuenta gratis de Gemini que ya vas a usar para el matching (sección
3 más abajo — si todavía no sacaste esa clave, puedes regresar a este paso
después).

1. ⚙️ Configuración del proyecto → Propiedades del script → Añadir propiedad.
2. Nombre: `GEMINI_API_KEY`. Valor: la misma clave de
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey) que vas a
   poner en el Worker de matching (sección 3).
3. Guarda.

> Sí, la misma clave va en dos lugares (aquí y en el Worker) porque son dos
> sistemas distintos llamando a Gemini por separado. No cuesta más por
> duplicarla — ambos usos entran en la misma capa gratuita de 1,500
> llamadas/día.

### 2.4 Implementar como aplicación web

1. **Implementar → Nueva implementación → Aplicación web**.
   - Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**.
2. Autoriza los permisos (Sheet, Drive para CVs/logos, envío de correos).
3. Copia la **URL de la aplicación web**.

> Cada vez que edites `Code.gs`: **Implementar → Gestionar implementaciones →
> editar → Nueva versión → Implementar**.

## 3. Instalar el Cloudflare Worker (matching por IA)

1. **Workers & Pages → Create application → Start with Hello World!**,
   nómbralo `jobmatch-ai-matching`. Deploy (te crea un "Hello World" de ejemplo).
2. **Edit code** → borra el ejemplo → pega el contenido de
   `cloudflare-worker/worker.js`. Deploy de nuevo.
3. Consigue tu clave gratis de Gemini: entra a
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey) con la
   misma cuenta de Google que usas para tu Sheet → **Create API key** →
   cópiala. No pide tarjeta y da hasta 1,500 llamadas gratis al día — de
   sobra para este proyecto (ver `docs/CUANDO-ESCALAR.md`).
4. **Settings → Variables and Secrets** → agrega `GEMINI_API_KEY` con esa
   clave (Type: **Secret**) → Deploy.
5. Copia la URL del Worker (ej.
   `https://jobmatch-ai-matching.tu-usuario.workers.dev`) — esta es la que va
   en `CF_WORKER_URL` dentro de `assets/js/app.js`.

## 4. PayPal — botones listos + activación automática (opcional pero recomendada)

Los 4 botones de suscripción ya están integrados en `portal-empresa.html`
(pestaña "Mi plan"), con tus `plan_id` reales. Sin el siguiente paso, siguen
cobrando bien, pero el plan se activa **a mano** en `admin-plataforma.html`.
Con el siguiente paso, se activa **solo** en cuanto PayPal confirma el pago.

### 4.1 Por qué hace falta un segundo Worker

PayPal firma cada webhook con headers HTTP especiales para probar que el
aviso viene realmente de ellos. Google Apps Script **no puede leer esos
headers** (es una limitación de la plataforma, no de este proyecto), así que
no puede verificar la firma por sí solo. Cloudflare Workers sí puede. Por eso
hay un segundo Worker (`paypal-webhook-worker.js`) que solo hace una cosa:
recibe el webhook, verifica con la propia API de PayPal que la firma es
legítima, y si todo cuadra, le avisa a tu Apps Script qué plan activar.

### 4.2 Consigue tus credenciales REST de PayPal

1. Entra a [developer.paypal.com](https://developer.paypal.com) → **Apps &
   Credentials** → la app que ya usas para los botones (o crea una si no
   tienes acceso a verla).
2. Copia el **Client ID** y el **Secret** (el Secret no lo has usado antes —
   es distinto del `client-id` que va en el HTML de los botones).

### 4.3 Despliega el segundo Worker

1. **Workers & Pages → Create → Worker**, nómbralo `jobmatch-paypal-webhook`.
2. Pega el contenido de `cloudflare-worker/paypal-webhook-worker.js`.
3. **Settings → Variables and Secrets**, agrega (marca **Encrypt** en todas):
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `APPS_SCRIPT_URL` (la misma del paso 2)
   - `WEBHOOK_SHARED_SECRET` — invéntate una contraseña larga distinta a tu
     `ADMIN_KEY`.
   - `PAYPAL_WEBHOOK_ID` — déjala vacía por ahora, la llenas en el paso 4.5.
4. **Deploy** y copia la URL (ej.
   `https://jobmatch-paypal-webhook.tu-usuario.workers.dev`).

### 4.4 Guarda el mismo secreto en Apps Script

En el editor de Apps Script: ⚙️ **Configuración del proyecto → Propiedades
del script → Añadir propiedad**. Nombre: `WEBHOOK_SHARED_SECRET`. Valor:
**exactamente la misma contraseña** que pusiste en el paso anterior — si no
coinciden letra por letra, Apps Script va a rechazar los avisos del Worker.

### 4.5 Crea el webhook en PayPal

1. En developer.paypal.com, dentro de tu app: sección **Webhooks → Add
   Webhook**.
2. URL: la del Worker que copiaste en el paso 4.3.
3. Eventos a marcar:
   - `BILLING.SUBSCRIPTION.ACTIVATED`
   - `BILLING.SUBSCRIPTION.RE-ACTIVATED`
   - `BILLING.SUBSCRIPTION.CANCELLED`
   - `BILLING.SUBSCRIPTION.EXPIRED`
   - `BILLING.SUBSCRIPTION.SUSPENDED`
4. Guarda. PayPal te va a mostrar un **Webhook ID** — cópialo y pégalo en la
   variable `PAYPAL_WEBHOOK_ID` del Worker (paso 4.3), luego vuelve a
   **Deploy**.

### 4.6 Probar que funciona

1. En modo sandbox de PayPal (o con un pago real chico), suscríbete a un
   plan desde `portal-empresa.html` con una empresa de prueba.
2. En unos segundos, el plan de esa empresa debería cambiar solo en el Sheet
   (columna `plan` de `Empresas`) — sin que toques `admin-plataforma.html`.
3. Si no cambió: revisa en Cloudflare **Workers & Pages → tu worker → Logs**
   para ver si PayPal llegó a mandar el webhook y si la verificación de firma
   pasó. El error más común es un `WEBHOOK_SHARED_SECRET` que no coincide
   exactamente entre el Worker y Apps Script.
4. Cancela esa suscripción de prueba y confirma que el plan vuelve solo a
   "Gratis".

> Si prefieres no montar esto todavía, no pasa nada — `admin-plataforma.html`
> sigue funcionando igual como respaldo manual, y puedes activar este webhook
> más adelante sin tocar el resto del proyecto.

## 5. Conectar las URLs en el sitio

Abre `assets/js/app.js` y reemplaza:

```js
const APPS_SCRIPT_URL = "PEGA_AQUI_TU_URL_DE_APPS_SCRIPT";
const CF_WORKER_URL = "PEGA_AQUI_TU_URL_DE_CLOUDFLARE_WORKER";
```

## 6. Subir a GitHub Pages

### Opción A — Solo subir archivos (sin terminal)

1. [github.com](https://github.com) → **New repository** → nómbralo
   `jobmatch-lite`, público, sin README.
2. Dentro del repo: **Add file → Upload files**.
3. Arrastra **todo el contenido** de la carpeta `jobmatch-lite` (todos los
   `.html` y las carpetas `assets/`, `apps-script/`, `cloudflare-worker/`,
   `docs/`).
4. Escribe un mensaje de commit → **Commit changes**.
5. **Settings → Pages → Source:** rama `main`, carpeta `/ (root)` → Guardar.
6. Espera 1-2 min: tu sitio queda en
   `https://tu-usuario.github.io/jobmatch-lite/`.

Para editar algo después: **Add file → Upload files** de nuevo con el archivo
modificado — GitHub lo sobreescribe solo.

### Opción B — Con git

```bash
cd jobmatch-lite
git init
git add .
git commit -m "🎉 JobMatch Pro - versión ligera"
git remote add origin https://github.com/TU_USUARIO/jobmatch-lite.git
git branch -M main
git push -u origin main
```

## 7. Probar de punta a punta

1. `registro-empresa.html` → crea una empresa de prueba con un RFC con
   formato válido (ej. `ABC850101AB1`). Debe llegarte un correo con el código.
2. `portal-empresa.html` → entra con ese código, publica una vacante desde
   la pestaña "Publicar vacante". Confirma que aparece en `vacantes.html`
   **antes** que cualquier vacante externa.
3. `admin-plataforma.html` → entra con tu `ADMIN_KEY`, publica una vacante
   externa de prueba (con un link cualquiera) y confirma que aparece
   **después** de las de empresas en `vacantes.html`, con el botón "Ver
   vacante original" en vez de formulario de postulación.
4. `candidato.html` → crea un perfil, sube un CV, llena el perfil
   socioeconómico, y escribe algunas habilidades en el nuevo campo de
   "Habilidades y competencias" (sepáralas con comas).
5. Postúlate a la vacante de prueba. Si quieres probar el flujo de datos
   socioeconómicos: en `admin-plataforma.html` sube el plan de la empresa de
   prueba a "Business", vuelve a postularte marcando el checkbox de
   autorización, y confirma en `portal-empresa.html` → pestaña
   "Postulaciones" que aparece el botón para verlos.
6. En `portal-empresa.html` → pestaña "Mi plan", prueba el botón de PayPal en
   modo sandbox si quieres (dashboard.paypal.com/developer) sin cobrar de
   verdad. También puedes probar el mismo botón directo desde `precios.html`.
7. `candidatos.html` → sin iniciar sesión, confirma que el candidato que
   acabas de crear aparece en el directorio (lista y mapa), mostrando solo
   sus habilidades — nunca su nombre, correo ni ubicación.
8. Con la misma empresa de prueba en plan Business: entra en `candidatos.html`,
   pega el texto de tu vacante en "Comparar contra una vacante" y confirma
   que el candidato aparece con un % de coincidencia. Dale "Solicitar
   contacto" — debe llegarle un correo al candidato con los links de
   autorizar/rechazar. Al darle clic a "Sí, autorizo" en ese correo, vuelve
   a `candidatos.html` y confirma que ahora puedes "Ver contacto autorizado".
9. En `admin-plataforma.html` → pestaña "Curaduría (triada)", elige esa
   vacante, marca al candidato como "En la triada" y escríbele un reporte —
   confirma que se ve resaltado en `portal-empresa.html` → "Postulaciones".

## 8. Funciones agregadas después del lanzamiento inicial

Esto no son pasos de instalación — es un resumen de lo que se fue
construyendo encima de la base, por si en algún momento necesitas ubicar
rápido dónde vive cada cosa.

- **Directorio público de candidatos** (`candidatos.html`): cualquiera puede
  navegarlo sin iniciar sesión — solo se ven habilidades, nunca datos
  identificables. Tiene vista de lista y un mapa visual (estilo grafo,
  usando D3.js desde un CDN) organizado por categorías de habilidades con
  colores. Solo empresas con plan **Business o A la medida** pueden comparar
  candidatos contra una vacante o solicitar contacto directo.
- **Solicitud de contacto**: cuando una empresa quiere el contacto de un
  candidato, se le manda un correo con dos links (autorizar/rechazar) — el
  candidato decide sin necesidad de iniciar sesión en ningún lado. Vive en
  la hoja `SolicitudesContacto`.
- **Vacantes destacadas de verdad**: las empresas Pro/Business/A la medida
  pueden destacar hasta un número de vacantes al mes (ver tabla de planes),
  y esas aparecen en una sección aparte y con un diseño distinto en
  `index.html` y `vacantes.html` — ya no es solo una etiqueta. El admin
  también puede destacar cualquier vacante (incluidas las externas) sin
  límite, desde `admin-plataforma.html`.
- **Expiración automática de vacantes**: desde `admin-plataforma.html`, se
  le puede poner fecha a cualquier vacante para que deje de mostrarse sola
  ese día, sin que tengas que entrar a pausarla a mano.
- **Curaduría/triada** (`admin-plataforma.html` → pestaña "Curaduría"): para
  vacantes de empresas Pro en adelante, ahí marcas qué candidatos forman la
  "triada" que le mandas a la empresa, y les escribes un reporte — se ve
  resaltado en el panel de esa empresa.
- **Seguridad**: bloqueo temporal tras varios intentos fallidos de
  `ADMIN_KEY`, enfriamiento anti-spam en registro de empresa y
  postulaciones, y todo el texto que viene de usuarios se limpia antes de
  mostrarse (protección contra XSS).
- **Candidatos de muestra**: si quieres ver el directorio poblado sin
  esperar candidatos reales, corre la función `seedDemoCandidatesForDirectory`
  desde el editor de Apps Script (menú de funciones → elegirla → ▶
  Ejecutar) — crea 20 candidatos de prueba, identificables porque su correo
  termina en `@jobmatch-demo.invalid`.

## 9. (Opcional) "Entrar con LinkedIn" para candidatos

Esto es aparte y opcional — el sitio funciona perfecto sin esto (los
candidatos ya pueden entrar con su código de acceso). Solo lo necesitas si
quieres darles también la opción de entrar con un clic desde LinkedIn.

**Importante antes de empezar**: esto solo confirma la identidad del
candidato (nombre y correo) — LinkedIn no permite importar automáticamente
experiencia, habilidades ni el CV de nadie por esta vía (esas APIs están
cerradas desde hace años, solo las tienen socios con convenio directo). El
candidato sigue teniendo que escribir sus habilidades a mano en su perfil.

### 9.1 Crea la app en LinkedIn

1. Ve a [www.linkedin.com/developers/apps](https://www.linkedin.com/developers/apps)
   → **Create app**.
2. Llena el formulario (nombre, tu página de empresa de LinkedIn — si no
   tienes una, créala rápido, es obligatoria para este paso, logo, etc.).
3. Ya dentro de tu app → pestaña **Products** → busca **"Sign In with
   LinkedIn using OpenID Connect"** → **Request access** (normalmente se
   aprueba solo, sin revisión manual).
4. Pestaña **Auth** → copia el **Client ID** y el **Client Secret** (vas a
   necesitar los dos).
5. En la misma pestaña, sección **Authorized redirect URLs** → agrega la URL
   exacta de tu página de candidato, ej.
   `https://tu-usuario.github.io/jobmatch-pro/candidato.html` — tiene que
   coincidir letra por letra con la que uses más abajo, o LinkedIn rechaza
   el login.

### 9.2 Instala el Worker de LinkedIn

1. En Cloudflare → **Workers & Pages → Create → Create Worker**, nómbralo
   `jobmatch-linkedin-auth`.
2. Pega el contenido de `cloudflare-worker/linkedin-auth-worker.js` de este
   proyecto → **Deploy**.
3. **Settings → Variables and Secrets** → agrega:
   - `LINKEDIN_CLIENT_ID` (Secret) — el que copiaste en 9.1.
   - `LINKEDIN_CLIENT_SECRET` (Secret) — el que copiaste en 9.1.
   - `LINKEDIN_REDIRECT_URI` (texto plano) — la misma URL exacta del paso
     9.1.5.
   - `APPS_SCRIPT_URL` (texto plano) — la misma que ya usas en los otros
     Workers.
   - `LINKEDIN_SHARED_SECRET` (Secret) — invéntate una cadena larga
     cualquiera, como hiciste con `WEBHOOK_SHARED_SECRET` de PayPal.
4. Copia la URL de este Worker (algo como
   `https://jobmatch-linkedin-auth.tu-usuario.workers.dev`).

### 9.3 Configura la misma clave en Apps Script

1. En Apps Script → ⚙️ **Configuración del proyecto → Propiedades del
   script → Añadir propiedad**.
2. Nombre: `LINKEDIN_SHARED_SECRET`. Valor: **exactamente** el mismo texto
   que pusiste en el Worker en el paso anterior.

### 9.4 Conecta las URLs en el sitio

Abre `assets/js/app.js` y reemplaza:

```js
const LINKEDIN_CLIENT_ID = "PEGA_AQUI_TU_LINKEDIN_CLIENT_ID";
const CF_LINKEDIN_WORKER_URL = "PEGA_AQUI_LA_URL_DEL_WORKER_DE_LINKEDIN";
```

### 9.5 Probar que funciona

1. Ve a `candidato.html` → botón **"Entrar con LinkedIn"**.
2. Te manda a LinkedIn, autorizas, y regresas a `candidato.html` — debería
   entrarte directo a tu perfil (o crear uno nuevo si es la primera vez).
3. Si ves un error, revisa primero que la URL de redirección sea **idéntica**
   en los tres lugares (tu app de LinkedIn, la variable del Worker, y desde
   dónde estás probando) — es el error más común en este tipo de login.

---

> **Nota de seguridad**: los códigos de acceso (empresa y candidato) funcionan
> como "contraseña" simple para que cada quien vea solo lo suyo — no es un
> login con contraseña real. Si alguien pierde su código, búscalo en el Sheet
> y reenvíalo por correo.
