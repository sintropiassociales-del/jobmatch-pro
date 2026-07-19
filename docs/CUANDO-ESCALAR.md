# 📈 ¿Cuándo migrar de esta versión ligera a la arquitectura completa?

Esta versión (GitHub Pages + Google Sheets + Apps Script + Cloudflare Worker)
es un MVP real, no un juguete — pero tiene límites técnicos duros, no solo
"se pone lento". Aquí están los números concretos para que sepas exactamente
cuándo dejar de parcharla y migrar a lo que ya armamos en `jobmatch-pro/`
(Render + Vercel + PostgreSQL).

## Tabla de umbrales

| Métrica | Zona verde (esta versión sobra) | Zona amarilla (empieza a doler) | Zona roja (migrar ya) |
|---|---|---|---|
| **Empresas pagando activamente** | 0–10 | 10–40 | **40+** |
| **Vacantes activas simultáneas** | 0–50 | 50–200 | **200+** |
| **Postulaciones por mes** | 0–300 | 300–1,500 | **1,500+** |
| **Correos enviados por día** (publicaciones + notificaciones de postulación) | 0–80 | 80–100 | **100+** |
| **Usuarios simultáneos en el sitio** | 0–20 | 20–30 | **30+** |

Basta con que **una sola** columna llegue a zona roja para que valga la pena
migrar, aunque las demás sigan en verde.

## Por qué esos números específicos (no son arbitrarios)

- **100 correos/día**: es el límite duro de `MailApp` en una cuenta de Gmail
  personal (1,500/día si usas Google Workspace). Pasado eso, Apps Script
  empieza a fallar el envío *silenciosamente* — la empresa deja de recibir
  avisos de nuevas postulaciones y ni tú ni ella se enteran.
- **30 usuarios simultáneos**: es aproximadamente donde las Web Apps de Apps
  Script empiezan a devolver errores intermitentes de "Servicio no
  disponible" bajo carga concurrente — no es un límite publicado por Google
  como número exacto, pero es el rango donde en la práctica se empieza a
  sentir.
- **200 vacantes / hojas de +5,000-10,000 filas combinando Vacantes y
  Postulaciones**: cada consulta de `listJobs` o `listApplications` lee la
  hoja completa con `getDataRange()`. No hay índices como en una base de
  datos real, así que el tiempo de respuesta crece de forma lineal con el
  tamaño del Sheet — a partir de varios miles de filas, tus usuarios van a
  notar 3-5 segundos de espera por cada búsqueda.
- **40 empresas pagando**: es el punto donde llevar el control manual de
  quién sigue pagando (revisando Stripe a mano y dando de baja tokens en el
  Sheet cuando alguien cancela) se vuelve una fuente real de errores —
  empresas que dejaron de pagar pero siguen con acceso, o al revés.
- **Escrituras simultáneas**: Google Sheets no está diseñado para muchas
  escrituras concurrentes. Con pocas empresas publicando/postulando a la vez
  no hay problema, pero según crece el tráfico aumenta el riesgo de que dos
  escrituras casi simultáneas se pisen entre sí (Apps Script sí permite
  usar `LockService` para mitigarlo, pero solo hasta cierto punto).

## Qué te da la migración (y ya está armado)

Cuando cruces al rojo, migras al proyecto `jobmatch-pro/` completo que ya
preparamos:

- **PostgreSQL real** en vez de Sheets → consultas rápidas sin importar el
  volumen, con índices.
- **Autenticación real** (JWT + hash de contraseñas) en vez de tokens sueltos
  en una hoja.
- **Stripe Billing con webhooks** → cuando una empresa deja de pagar, su
  acceso se desactiva automáticamente, sin que tú lo revises a mano.
- **Envío de correo vía SendGrid** → sin límite de 100/día.
- **Render + Vercel** soportan tráfico concurrente real sin los límites de
  cuota de Apps Script.

La guía paso a paso para esa migración ya está en
`jobmatch-pro/docs/DEPLOY-GUIDE.md`, y el `render.yaml` /
`docker-compose.yml` de esa versión ya están listos para cuando llegue el
momento — no hay que empezar de cero, solo conectar el mismo Google Sheet
(exportado a CSV) como datos iniciales de la base PostgreSQL.

## Zona amarilla: qué hacer mientras tanto

Si ya estás en zona amarilla pero todavía no justifica el costo/esfuerzo de
migrar por completo, hay parches que estiran esta versión un poco más:

1. Cambia a una cuenta de **Google Workspace** (aunque sea la más barata) para
   pasar de 100 a 1,500 correos/día.
2. Agrega **paginación real** en `listJobs_()` (ahora mismo trae todo y
   recorta con `.slice()`, lo cual igual lee la hoja completa cada vez).
3. Considera separar Vacantes activas de un histórico de vacantes cerradas en
   una segunda hoja, para que las consultas del día a día lean menos filas.

Ninguno de estos parches resuelve el límite de fondo — solo compran tiempo.
