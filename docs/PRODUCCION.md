# Puesta en producción de AquaControl

Esta lista separa la preparación técnica de las decisiones que requieren al
propietario del producto o a un proveedor externo.

La configuracion reproducible de staging y los pasos de migracion a Supabase se
encuentran en `docs/DESPLIEGUE_SUPABASE_RENDER.md`. El servicio operativo debe
permanecer en una instancia Node persistente mientras use Socket.IO y GPS.

## 1. Datos que debe entregar el propietario

- Dominio definitivo y acceso a su DNS.
- Razón social, RUC, domicilio, correo de privacidad y canal de soporte.
- Nombre comercial, logotipo, precios finales, impuestos y política de reembolsos.
- Cuenta de hosting y región donde se almacenarán los datos.
- Base PostgreSQL administrada y destino independiente para backups.
- Cuenta Resend y dominio de envío verificado.
- Afiliación Kushki Ecuador y credenciales UAT/producción.
- Responsable que recibirá alertas operativas y de seguridad.

No se deben habilitar cobros hasta que términos, privacidad, contrato comercial
y obligaciones tributarias hayan sido revisados por profesionales en Ecuador.

## 2. Variables obligatorias

Use un gestor de secretos del proveedor, no un archivo `.env` dentro de la
imagen:

```dotenv
NODE_ENV=production
PORT=3000
APP_URL=https://app.dominio.example
ALLOWED_ORIGINS=https://app.dominio.example
TRUST_PROXY=1

DB_HOST=host-privado
DB_PORT=5432
DB_NAME=aquacontrol
DB_USER=usuario-restringido
DB_PASSWORD=secreto
DB_SSL=true

JWT_SECRET=secreto-aleatorio-de-32-o-mas-caracteres
JWT_EXPIRES_IN=8h
MONITORING_TOKEN=otro-secreto-independiente
PLATFORM_ADMIN_EMAIL=propietario@dominio.example
PLATFORM_ADMIN_PASSWORD=contrasena-temporal-de-14-o-mas-caracteres

RESEND_API_KEY=re_...
EMAIL_FROM=AquaControl <notificaciones@dominio.example>

KUSHKI_ENVIRONMENT=production
KUSHKI_PUBLIC_MERCHANT_ID=...
KUSHKI_PRIVATE_MERCHANT_ID=...
KUSHKI_WEBHOOK_SIGNATURE=...

LOCATION_RETENTION_DAYS=30
AUDIT_RETENTION_DAYS=365
BACKUP_RETENTION_DAYS=14
BACKUP_DIR=/backups
```

El proceso se detiene en producción si `APP_URL` no usa HTTPS,
`ALLOWED_ORIGINS` está vacío, falta la clave JWT o faltan datos de PostgreSQL.

La consola del propietario se publica en `/plataforma/`. La primera cuenta se
crea desde las variables `PLATFORM_ADMIN_*` y obliga a reemplazar la contraseña
temporal. Esta cuenta es independiente de los administradores de cada empresa.

## 3. Correo

1. Verificar el dominio en Resend.
2. Crear una dirección remitente del mismo dominio.
3. Definir `RESEND_API_KEY` y `EMAIL_FROM`.
4. Registrar una empresa de prueba y confirmar que el mensaje llega.
5. Probar enlace vencido, reenvío y recuperación de contraseña.

Referencia: [envío de correo](https://resend.com/docs/api-reference/emails/send-email)
y [dominio remitente verificado](https://resend.com/docs/knowledge-base/how-do-I-create-an-email-address-or-sender-in-resend).

## 4. Cobros Kushki

1. Completar la afiliación comercial en Ecuador.
2. Probar Kajita y suscripciones en `KUSHKI_ENVIRONMENT=uat`.
3. Configurar el webhook público:
   `POST https://app.dominio.example/api/billing/webhook/kushki`.
4. Copiar la firma asignada al webhook en `KUSHKI_WEBHOOK_SIGNATURE`.
5. Validar cobro exitoso, rechazo, reintento, último reintento y cancelación.
6. Cambiar a credenciales de producción solo después de la certificación.

El endpoint comprueba comercio, timestamp y HMAC, y guarda identificadores de
evento para que un reintento no se procese dos veces.

Referencias: [suscripción de tarjeta](https://docs.kushki.com/ec/en/recurring-payments/scheduled-payments/subscribe-a-card/),
[notificaciones](https://docs.kushki.com/co/en/notifications/overview/) y
[cancelación](https://docs.kushki.com/ec/en/recurring-payments/scheduled-payments/manage-scheduled-charges/).

## 5. Despliegue

1. Construir la imagen desde el `Dockerfile`.
2. Ejecutar migración/inicialización arrancando una sola instancia primero.
3. Confirmar `GET /api/health`.
4. Conectar logs JSON a la plataforma de observabilidad.
5. Consultar `/api/metrics` con el token desde un monitor privado.
6. Habilitar al menos dos instancias solo cuando WebSocket tenga afinidad de
   sesión o un adaptador compartido como Redis.

El directorio `frontend` se sirve desde el mismo origen. No requiere un
despliegue web separado.

## 6. Backups y restauración

Ejecute `npm run backup` al menos una vez al día y copie el `.dump` a un
almacenamiento cifrado que no comparta disco con la aplicación.

La restauración exige una autorización explícita:

```bash
ALLOW_DATABASE_RESTORE=true npm run restore -- /backups/aquacontrol.dump
```

Cada mes se debe restaurar el último backup en una base aislada, verificar
tablas y conteos, iniciar una instancia temporal y documentar el resultado.

## 7. Aceptación antes de clientes reales

- Pruebas automáticas e integración sin fallos.
- Backup creado y restauración probada en una base aislada.
- Flujo de correo real probado.
- Ciclo completo de pago UAT aprobado.
- Prueba móvil de administrador, repartidor y cliente.
- Consentimiento GPS revisado con la política laboral de cada distribuidora.
- Alertas de errores, latencia, espacio, conexiones y fallos de backup.
- Prueba de carga con el volumen esperado y margen de crecimiento.
- Escaneo de dependencias y revisión independiente de seguridad.
- Términos, privacidad y contrato aprobados y publicados.
