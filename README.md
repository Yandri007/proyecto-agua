# AquaControl

La aplicacion web operativa vive en `frontend/`. El cliente Flutter
multiplataforma se mantiene por separado en `mobile/` y consume el mismo backend.

AquaControl es una plataforma SaaS multiempresa para distribuidoras de agua.
Una sola instalación atiende a todas las empresas y separa usuarios, productos,
pedidos, inventario, auditoría y ubicaciones mediante `empresa_id`.

No se deben mantener copias distintas del código por cliente. La marca, los
planes y las funciones particulares deben resolverse con configuración por
empresa y, cuando sea necesario, banderas de funcionalidad.

## Acceso y roles

La portada `/` es el único punto de acceso:

- El administrador registra la distribuidora e inicia una prueba de 14 días.
- Administradores y repartidores verifican su correo antes de entrar.
- El administrador crea las cuentas de sus repartidores.
- Cada administrador comparte un único portal seguro de su distribuidora; desde
  ese enlace los clientes crean exclusivamente una cuenta con rol `cliente`.
- El servidor determina el rol y redirige al panel autorizado.

Rutas:

- Administrador: `/admin/`
- Repartidor: `/repartidor/`
- Cliente: `/cliente/app.html`

## Funciones implementadas

- Sesión en cookie `HttpOnly`, invalidación global, permisos por rol y rate limits.
- Verificación de correo y recuperación de contraseña con tokens de un solo uso.
- Activación piloto asistida, con confirmación de identidad, enlace temporal y auditoría global.
- Módulo de clientes para compartir o renovar el portal de alta, buscar cuentas
  y suspender o reactivar su acceso.
- Aislamiento multiempresa en HTTP, PostgreSQL y salas WebSocket.
- Productos, inventario, pedidos, repartidores, entregas y confirmaciones.
- Historial detallado y de solo lectura para repartidores.
- Ventas en ruta con control de duplicados, inventario y conciliación administrativa.
- Módulos opcionales de RR. HH., planta y logística configurables por empresa.
- Perfiles laborales y cuentas para RR. HH. y jefatura de planta.
- Flota, stock por vehículo, envases retornables, depósitos, comprobantes firmados y cierres de ruta.
- Métodos de pago en pedidos y conciliación conjunta de entregas y ventas directas.
- Cierres protegidos contra ventas pendientes o movimientos posteriores a su aprobación.
- Entregas recurrentes con frecuencia, edición, pausa, omisión e historial de ejecuciones.
- Lotes de producción con aprobación de calidad antes de ingresar stock.
- Dashboard, reportes, exportación, mapa operativo y GPS en tiempo real.
- Consentimiento explícito del repartidor y conservación configurable de ubicación.
- Auditoría administrativa visible desde el panel.
- Prueba, planes, límites, bloqueo por estado y suscripciones recurrentes Kushki.
- Logs JSON, identificador de solicitud, métricas protegidas y mantenimiento diario.
- Backups PostgreSQL, restauración protegida y contenedor de aplicación.
- Términos y privacidad base, pendientes de completar con la identidad legal.

## Requisitos

- Node.js 18 o superior.
- PostgreSQL 14 o superior.
- Para contenedores locales: Docker con Compose.

## Inicio local

En Windows se puede abrir `AquaControl-Iniciar.cmd`. El iniciador comprueba
PostgreSQL, solicita permiso de administrador únicamente si debe iniciar el
servicio, levanta la API y abre `http://localhost:3000`.

1. Copiar `backend/.env.example` como `backend/.env`.
2. Configurar PostgreSQL y un `JWT_SECRET` aleatorio de al menos 32 caracteres.
3. Ejecutar:

```bash
cd backend
npm install
npm start
```

La aplicación queda disponible en `http://localhost:3000`.

Para crear o restablecer las cinco cuentas locales de demostración:

```bash
cd backend
npm run seed:demo
```

Este comando no se ejecuta automáticamente y rechaza su uso cuando
`NODE_ENV=production`.

Las cuentas demo incluyen `admin`, `repartidor`, `cliente`, `rh` y
`jefe_planta`; todas usan `AquaDemo-2026!`. El detalle está en
[`docs/ESTADO_PROYECTO.md`](docs/ESTADO_PROYECTO.md).

También puede iniciarse el entorno local completo desde la raíz:

```bash
docker compose up --build
```

El archivo `docker-compose.yml` es solo para desarrollo y usa credenciales
locales. No debe reutilizarse sin cambios en producción.

## Verificación

```bash
cd backend
npm test
npm run check
npm run audit:db-security
npm run test:integration
npm run test:load
npm run test:deployment
npm run preflight:staging
npm run preflight
npm run backup
```

`npm run preflight` comprueba los requisitos de publicación sin mostrar
secretos. Debe aprobar antes de desplegar en producción.

La integración requiere el servidor y PostgreSQL activos. Crea empresas
temporales, comprueba aislamiento, portal de clientes, identidad, recurrencias, módulos, personal, planta, flota,
ventas en ruta, dos pedidos consecutivos a direcciones distintas, stock, GPS,
comprobantes, cierres, reportes y la CSP con nonce,
y elimina los datos de prueba al terminar.

`npm run test:load` realiza una prueba de humo local y no apunta a servidores
remotos salvo que se habilite explícitamente con `ALLOW_LOAD_TEST=true`.

`npm run test:deployment` valida un staging HTTPS sin modificar pedidos. La
guia de infraestructura esta en
[`docs/DESPLIEGUE_SUPABASE_RENDER.md`](docs/DESPLIEGUE_SUPABASE_RENDER.md).

## Proveedores opcionales

El correo transaccional admite Brevo y Resend. `EMAIL_PROVIDER=auto` prioriza
`BREVO_API_KEY` y usa `RESEND_API_KEY` como alternativa. Sin proveedor, los
enlaces automáticos se devuelven únicamente en desarrollo; para pilotos sin
dominio, el propietario puede generar enlaces privados para administradores y
personal desde `/plataforma/ > Activaciones` después de verificar la identidad
por otro canal. El alta de consumidores se realiza desde el enlace que cada
administrador obtiene en `/admin/ > Clientes`.

Sin credenciales de Kushki, el panel muestra los planes pero no permite cobrar.
La tarjeta se captura con Kajita y AquaControl no guarda PAN ni CVV. Consulte la
[API de Brevo](https://developers.brevo.com/reference/sendtransacemail), la
[API de correo de Resend](https://resend.com/docs/api-reference/emails/send-email)
y las [suscripciones recurrentes de Kushki Ecuador](https://docs.kushki.com/ec/recurring-payments/overview/).

## Operación

- Salud: `GET /api/health`
- Métricas: `GET /api/metrics` con `Authorization: Bearer MONITORING_TOKEN`
- Backup: `npm run backup`
- Restauración: definir `ALLOW_DATABASE_RESTORE=true` y ejecutar
  `npm run restore -- ruta/al/respaldo.dump`

Los logs se escriben como JSON a la salida estándar para que la plataforma de
hosting pueda centralizarlos. La guía completa está en
[`docs/PRODUCCION.md`](docs/PRODUCCION.md).
La comparación funcional y la hoja de ruta están en
[`docs/ANALISIS_PRODUCTO.md`](docs/ANALISIS_PRODUCTO.md).

## Pendientes externos para producción comercial

El software ya contiene la base técnica del SaaS. El lanzamiento comercial aún
requiere:

- Dominio propio, hosting sin suspensión y almacenamiento externo de backups.
- Brevo o Resend con dominio de envío autenticado.
- Afiliación Kushki, credenciales de producción y webhook configurado.
- Razón social, RUC, domicilio, soporte y revisión legal en Ecuador.
- Monitoreo externo, alertas, prueba de restauración y prueba de carga con el
  volumen comercial esperado.
- Revisión independiente de seguridad antes de procesar clientes reales.

Las demostraciones y los primeros pilotos controlados pueden operar con la URL
de Render, Supabase y activación asistida. El procedimiento y sus límites están
en [`docs/PILOTO_SIN_DOMINIO.md`](docs/PILOTO_SIN_DOMINIO.md).

## Arquitectura de despliegue

La aplicacion operativa se despliega como servicio Node persistente en Render y
usa Supabase PostgreSQL. Esta decision conserva Socket.IO y GPS sin los limites
de ciclo de vida de una funcion serverless. Vercel queda reservado para una web
comercial separada si se necesita en el futuro.
