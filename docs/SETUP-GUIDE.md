# 🚀 Guía de instalación — JobMatch Pro (versión ligera)

Mismo flujo que ya conoces de tus otros proyectos (repositorio bibliográfico,
SintropíaDash): Google Sheet como base de datos, Apps Script como backend,
Cloudflare Worker como proxy de IA, y GitHub Pages para el sitio.

## 1. Crear el Google Sheet

1. Crea un Google Sheet nuevo, llámalo `JobMatch Pro - Base de Datos`.
2. No necesitas crear las hojas a mano — `Code.gs` las crea solas la primera
   vez que se usan (Vacantes, Postulaciones, Candidatos, PerfilSocioeconomico,
   PagosEmpresas), con sus encabezados.

## 2. Instalar el backend (Apps Script)

1. En el Sheet: **Extensiones → Apps Script**.
2. Borra el contenido de `Code.gs` que viene por default y pega el contenido
   de `apps-script/Code.gs` de este proyecto.
3. Guarda (ícono de disco o `Ctrl+S`).

### 2.1 Configura tu clave de administrador (ADMIN_KEY)

Esto protege `admin-plataforma.html` para que solo tú puedas subir el plan de
una empresa después de confirmar un pago.

1. En el editor de Apps Script: ícono de engrane ⚙️ **Configuración del
   proyecto** (menú izquierdo).
2. Baja hasta **Propiedades del script → Añadir propiedad de script**.
3. Nombre: `ADMIN_KEY`. Valor: una contraseña larga que solo tú conozcas.
   Guarda.

### 2.2 Implementar como aplicación web

1. Click en **Implementar → Nueva implementación**.
   - Tipo: **Aplicación web**.
   - Ejecutar como: **Yo (tu cuenta)**.
   - Quién tiene acceso: **Cualquier usuario**.
2. Autoriza los permisos que pida (Sheet, Google Drive para los CVs, envío de
   correos).
3. Copia la **URL de la aplicación web** que te da al final — la necesitas en
   el paso 5.

> Cada vez que edites `Code.gs`, tienes que hacer **Implementar → Gestionar
> implementaciones → editar (ícono de lápiz) → Nueva versión → Implementar**
> para que los cambios se reflejen en la URL pública.

## 3. Instalar el Cloudflare Worker (matching por IA)

1. En el dashboard de Cloudflare: **Workers & Pages → Create → Worker**.
2. Ponle un nombre (ej. `jobmatch-ai-proxy`).
3. Pega el contenido de `cloudflare-worker/worker.js`.
4. Ve a **Settings → Variables and Secrets** y agrega `OPENAI_API_KEY` (marca
   **Encrypt**).
5. Despliega (**Deploy**) y copia la URL del Worker.

## 4. PayPal — ya está listo, solo confírmalo

Los 4 botones de suscripción (Starter, Pro, Business, A la medida) ya vienen
integrados en `precios.html` con tus `plan_id` reales. No tienes que crear
nada nuevo en PayPal — solo confirma que esos 4 planes siguen activos en tu
cuenta de PayPal (Herramientas → Facturación recurrente → Planes).

> Importante: los botones de PayPal **no activan el plan automáticamente** en
> la plataforma — solo cobran. Cuando alguien paga, te llega un correo a
> `direccion@sintropiasocial.com` con los datos de facturación y el
> `subscriptionId`. Tú confirmas en PayPal que el cobro sí entró, y luego
> activas el plan a mano en `admin-plataforma.html` (con tu `companyToken`).
> Es manual a propósito, para que tengas control total mientras el volumen es
> bajo — ver `docs/CUANDO-ESCALAR.md`.

## 5. Conectar las URLs en el sitio

Abre `assets/js/app.js` y reemplaza:

```js
const APPS_SCRIPT_URL = "PEGA_AQUI_TU_URL_DE_APPS_SCRIPT";
const CF_WORKER_URL = "PEGA_AQUI_TU_URL_DE_CLOUDFLARE_WORKER";
```

con las URLs que copiaste en los pasos 2 y 3.

## 6. Subir a GitHub Pages

### Opción A — Solo subir archivos (sin usar la terminal)

Esta es la forma más parecida a como lo has hecho con tus otras páginas:

1. Entra a [github.com](https://github.com) y crea un repositorio nuevo
   (**New repository**). Nómbralo, por ejemplo, `jobmatch-lite`. Puede ser
   público. No marques "Add a README" (para que quede vacío).
2. Dentro del repo recién creado, click en **Add file → Upload files**.
3. Abre en tu computadora la carpeta `jobmatch-lite` que descargaste de este
   chat, selecciona **todo su contenido** (todos los archivos y carpetas:
   `index.html`, `assets/`, `apps-script/`, `cloudflare-worker/`, `docs/`,
   etc.) y arrástralos a la ventana de GitHub.
4. Espera a que termine de subir, escribe un mensaje de commit (ej. "Primera
   versión de JobMatch Pro") y click en **Commit changes**.
5. Ve a **Settings** (del repositorio) → **Pages** (menú izquierdo).
6. En **Source**, selecciona rama `main` y carpeta `/ (root)`. Guarda.
7. Espera 1-2 minutos y recarga la página — arriba te va a mostrar la URL
   pública, algo como `https://tu-usuario.github.io/jobmatch-lite/`.

### Opción B — Con git (si ya tienes GitHub Desktop o terminal configurada)

```bash
cd jobmatch-lite
git init
git add .
git commit -m "🎉 JobMatch Pro - versión ligera"
git remote add origin https://github.com/TU_USUARIO/jobmatch-lite.git
git branch -M main
git push -u origin main
```

Luego el mismo paso 5-7 de la Opción A (**Settings → Pages**).

### Si editas algo después

Con la Opción A: vuelve a **Add file → Upload files** y sube de nuevo el(los)
archivo(s) que cambiaste — GitHub los sobreescribe automáticamente si tienen
el mismo nombre y ruta. Con la Opción B: `git add . && git commit -m "..." && git push`.

## 7. Probar de punta a punta

1. Abre tu sitio publicado → `publicar-vacante.html` → publica una vacante de
   prueba. Debe llegarte un correo con el `companyToken`.
2. Ve a `vacantes.html` y confirma que aparece.
3. Entra a la vacante, llena el formulario de postulación con un perfil de
   prueba. Debe calcular un % de afinidad y guardar la postulación. Si la
   vacante es de plan Business/A la medida, debe aparecer el checkbox de
   autorización de datos socioeconómicos.
4. Ve a `candidato.html`, crea un perfil de prueba, sube un CV (PDF) y llena
   el perfil socioeconómico. Confirma que puedes volver a entrar con el
   código que te llega por correo.
5. Ve a `admin.html`, pega el `companyToken` del correo, y confirma que ves
   la postulación de prueba (y el botón de perfil socioeconómico si aplica).
6. Ve a `precios.html`, pega un `companyToken` de prueba y prueba el flujo de
   PayPal en modo sandbox si quieres probarlo sin cobrar de verdad (PayPal
   tiene cuentas de prueba — dashboard.paypal.com/developer).
7. Ve a `admin-plataforma.html`, entra con tu `ADMIN_KEY` y confirma que
   puedes ver y cambiar el plan de la empresa de prueba.

---

> **Nota de seguridad**: el `companyToken` y el código de candidato funcionan
> como "contraseña" simple para que cada quien vea solo lo suyo. No es un
> sistema de login real (no hay usuarios ni sesiones) — es intencional para
> mantener esta versión sin backend propio. Si alguien pierde su código,
> tendrías que buscarlo manualmente en el Sheet y reenviarlo por correo.
