# Despliegue de AquaControl con Supabase y Render

## Arquitectura elegida

- Render ejecuta el contenedor Node.js/Express y mantiene Socket.IO, GPS y las
  salas privadas en un proceso persistente.
- Supabase proporciona PostgreSQL administrado con TLS y pool de conexiones.
- GitHub Actions valida cada cambio antes de que Render despliegue `main`.
- Vercel se reserva para una futura web comercial separada. La aplicacion
  operativa no se ejecuta en Vercel Functions para evitar limites de duracion y
  distribucion de conexiones WebSocket entre instancias.

Para las primeras pruebas se usa una instancia Render `free`. No genera costo,
pero se duerme despues de 15 minutos sin solicitudes HTTP ni mensajes WebSocket
y puede tardar cerca de un minuto en responder al reactivarse. Mientras una ruta
envie ubicaciones por WebSocket, ese trafico mantiene activo el servicio. Esta
modalidad sirve para demostraciones y pilotos controlados, no para ofrecer un
acuerdo de disponibilidad a clientes.

## 1. Crear el proyecto Supabase

1. Crear un proyecto nuevo y guardar la contrasena de PostgreSQL en un gestor
   de secretos.
2. Elegir una region cercana a la region de Render.
3. En `Connect`, seleccionar `Shared Pooler` en modo `Session`, puerto `5432`.
4. Copiar la URI completa como `DATABASE_URL`. El usuario suele tener el
   formato `postgres.<project-ref>`.
5. Guardar tambien la conexion directa como `DATABASE_DIRECT_URL` para
   `pg_dump` y `pg_restore` desde un equipo que tenga conectividad IPv6. Esta
   segunda URL no es necesaria para ejecutar la aplicacion en Render.

No se deben copiar estas URLs al repositorio, archivos Markdown, capturas ni
mensajes. Render las almacena como secretos.

Documentacion: https://supabase.com/docs/guides/database/connecting-to-postgres

## 2. Preparar correo de staging

Crear una API key en Resend. Para una prueba personal se puede usar
`AquaControl <onboarding@resend.dev>` y enviar solo al correo propietario de la
cuenta. Para probar con terceros se debe verificar un dominio y configurar
`EMAIL_FROM` con ese dominio.

## 3. Crear el servicio en Render

1. Subir la rama `main` al repositorio de GitHub.
2. En Render, seleccionar `New > Blueprint` y conectar el repositorio.
3. Render detectara `render.yaml` y creara `aquacontrol-saas`.
4. Introducir `DATABASE_URL` y `RESEND_API_KEY` cuando el Blueprint los pida.
5. Confirmar el plan `free` y desplegar. No seleccionar una instancia de pago.

Render genera `JWT_SECRET` y `MONITORING_TOKEN`. La aplicacion toma
automaticamente `RENDER_EXTERNAL_URL` como `APP_URL` y origen autorizado. Cuando
se conecte un dominio propio, se deben definir explicitamente:

```env
APP_URL=https://app.tu-dominio.com
ALLOWED_ORIGINS=https://app.tu-dominio.com
EMAIL_FROM=AquaControl <notificaciones@tu-dominio.com>
```

Documentacion: https://render.com/docs/blueprints

## 4. Comprobar staging

El health check de Render usa `/api/health` y valida tambien PostgreSQL. Tras el
primer despliegue se registra una empresa desde la portada y se confirma el
correo. Luego se ejecuta desde `backend`:

```powershell
$env:DEPLOYMENT_URL='https://aquacontrol-saas.onrender.com'
$env:STAGING_TEST_EMAIL='administrador@correo.com'
$env:STAGING_TEST_PASSWORD='contrasena-de-prueba'
npm run test:deployment
```

La prueba comprueba HTTPS, salud, cinco interfaces, nonce CSP, recursos
locales, rechazo anonimo, cookie segura, login y Socket.IO. No crea ni modifica
pedidos.

## 5. Paso a produccion comercial

- Cambiar al plan Supabase Pro para disponer de backups diarios administrados.
- Verificar restauracion en un proyecto Supabase aislado.
- Conectar dominio propio y remitente Resend verificado.
- Completar certificacion Kushki y configurar sus secretos de produccion.
- Ejecutar `npm run preflight`, `npm run test:deployment` y una prueba piloto en
  telefonos reales.
- Configurar alertas externas sobre `/api/health` y `/api/metrics`.

Referencias:

- https://render.com/docs/websocket
- https://render.com/docs/free
- https://supabase.com/docs/guides/platform/backups
- https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections
