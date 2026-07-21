# 🚀 Guía de instalación — JobMatch Pro (versión ligera)

## 1. Crear el Google Sheet

1. Crea un Google Sheet nuevo, llámalo `JobMatch Pro - Base de Datos`.
2. No necesitas crear las hojas a mano — `Code.gs` las crea solas la primera
   vez que se usan: `Empresas`, `Vacantes`, `Postulaciones`, `Candidatos`,
   `PerfilSocioeconomico`, `PagosEmpresas`.

## 2. Instalar el backend (Apps Script)

1. En el Sheet: **Extensiones → Apps Script**.
2. Borra el contenido de `Code.gs` que viene por default y pega el contenido
   de `apps-script/Code.gs` de este proyecto. Guarda.

### 2.1 Configura tu clave de administrador (ADMIN_KEY)

1. Ícono de engrane ⚙️ **Configuración del proyecto → Propiedades del script
   → Añadir propiedad de script**.
2. Nombre: `ADMIN_KEY`. Valor: una contraseña larga que solo tú conozcas.

### 2.2 Implementar como aplicación web

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
4. `candidato.html` → crea un perfil, sube un CV y llena el perfil
   socioeconómico.
5. Postúlate a la vacante de prueba. Si quieres probar el flujo de datos
   socioeconómicos: en `admin-plataforma.html` sube el plan de la empresa de
   prueba a "Business", vuelve a postularte marcando el checkbox de
   autorización, y confirma en `portal-empresa.html` → pestaña
   "Postulaciones" que aparece el botón para verlos.
6. En `portal-empresa.html` → pestaña "Mi plan", prueba el botón de PayPal en
   modo sandbox si quieres (dashboard.paypal.com/developer) sin cobrar de
   verdad.

---

> **Nota de seguridad**: los códigos de acceso (empresa y candidato) funcionan
> como "contraseña" simple para que cada quien vea solo lo suyo — no es un
> login con contraseña real. Si alguien pierde su código, búscalo en el Sheet
> y reenvíalo por correo.
