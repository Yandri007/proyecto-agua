# Estado de AquaControl

Última actualización: 19 de agosto de 2026.

## Decisión de producto

AquaControl se mantiene como un SaaS multiempresa con una sola base de código.
Administradores, repartidores y clientes ingresan desde la misma portada; el
servidor identifica su rol y abre el panel correspondiente. Los datos se aíslan
por `empresa_id`.

No se crearán copias diferentes del código por cliente. Personalizaciones
futuras deben manejarse mediante configuración por empresa y banderas de
funcionalidad.

## Implementado

- Registro de empresa y prueba de 14 días.
- Inicio de sesión unificado y autorización por roles.
- Detección de cambio de sesión entre pestañas, incluyendo cambios entre dos
  usuarios del mismo rol, con redirección segura al panel activo.
- Cookies `HttpOnly`, rate limits e invalidación global de sesiones.
- Verificación de correo y recuperación de contraseña.
- Gestión de productos, inventario, pedidos, clientes y repartidores.
- Libreta privada de direcciones por cliente, ubicación principal,
  instrucciones para el repartidor y reutilización segura al repetir pedidos.
- Planificador de rutas por fecha y repartidor, orden de paradas, inicio de
  jornada, selección de una parada activa y progreso automático.
- Incidencias tipificadas, detalle, reprogramación y liberación segura del pedido.
- Notificaciones persistentes y WebSocket para asignación, salida, incidencia y entrega.
- Aislamiento multiempresa en API, PostgreSQL y WebSocket.
- Dashboard, reportes y exportación.
- Mapa operativo y GPS en tiempo real.
- Sincronización por empresa para administrador, cliente, repartidor, RH y jefe
  de planta, con refresco periódico como respaldo.
- Monitor de conexión, estado visible y recarga automática al recuperar la API.
- Consentimiento explícito para ubicación y política de conservación.
- Auditoría visible para administradores.
- Planes, límites y bloqueo según suscripción.
- Integración preparada para suscripciones recurrentes con Kushki.
- Correo transaccional preparado para Resend.
- Logs JSON, métricas protegidas y mantenimiento diario.
- Backups y restauración PostgreSQL.
- Dockerfile y Docker Compose para desarrollo.
- Términos, privacidad y guía de producción.
- Ventas realizadas durante la ruta con revisión y exportación administrativa.
- Historial detallado y de solo lectura para repartidores.
- Módulos opcionales de Recursos Humanos y planta por empresa.
- Perfiles laborales y cuentas para RR. HH. y jefatura de planta.
- Lotes de producción y aprobación de calidad con entrada controlada de stock.
- Módulo opcional de logística y flota por empresa.
- Inventario por vehículo con carga, descarga y trazabilidad de movimientos.
- Envases retornables y depósitos en pedidos y ventas directas.
- Comprobante de entrega con receptor, firma, ubicación y consulta por cliente.
- Cierre diario de ruta con efectivo esperado, declarado, diferencia y revisión.
- Depósitos de envases calculados al entregar e incorporados al total del pedido.
- Métodos de pago en pedidos normales y recurrentes.
- Conciliación de cierres con pedidos entregados y ventas directas aprobadas.
- Bloqueo de cierres con ventas pendientes y de operaciones tardías sobre rutas cerradas.
- Entregas recurrentes semanales, quincenales y mensuales.
- Edición, pausa, reanudación, omisión y cancelación de programaciones.
- Generación automática idempotente con historial y alertas de stock o plan.
- Panel administrativo de supervisión y procesamiento manual de vencidas.
- Sistema visual compartido para administración, cliente, repartidor, equipo y
  portada, con jerarquía operativa y adaptación móvil.
- Marca propia de AquaControl y fotografías de catálogo para bidón, botella,
  galón y paca de botellas.
- Carrusel de portada con fotografías propias de bodega, distribución y control
  administrativo, controles accesibles y navegación móvil.
- Leaflet servido localmente, mosaicos oficiales de OpenStreetMap, atribución y
  estados de error visibles.
- Mutaciones autenticadas por cookie protegidas mediante validación de
  `Origin` o `Referer`.
- Scripts inline protegidos con nonce CSP por respuesta y Chart.js, SheetJS,
  Font Awesome, Inter y Leaflet servidos localmente.
- Conexion mediante `DATABASE_URL` preparada para Supabase, con pool limitado,
  TLS obligatorio en produccion y conexion directa separada para respaldos.
- Blueprint de Render, GitHub Actions y prueba remota de despliegue preparados.
- Consola independiente del propietario en `/plataforma/`, con credencial y
  sesión separadas, cambio obligatorio de contraseña temporal, resumen del SaaS,
  gestión de empresas, planes, pruebas, módulos y auditoría global.

## Cuentas locales de demostración

Empresa: `AquaControl Demo`

Código de empresa: `aqua-demo`

Contraseña común: `AquaDemo-2026!`

| Rol | Correo |
| --- | --- |
| Administrador | `demo.admin@aquacontrol.com` |
| Repartidor | `demo.repartidor@aquacontrol.com` |
| Cliente | `demo.cliente@aquacontrol.com` |
| Recursos Humanos | `demo.rh@aquacontrol.com` |
| Jefe de planta | `demo.planta@aquacontrol.com` |

Las cuentas se pueden restablecer desde `backend` con:

```bash
npm run seed:demo
```

El comando rechaza su ejecución en producción.

## Verificación realizada

- `npm test`: 22 pruebas aprobadas.
- `npm run check`: 8 interfaces y 6 scripts verificados.
- `npm run test:integration`: identidad, direcciones, rutas, incidencias, notificaciones, recurrencias, módulos, personal, planta,
  flota, ventas, GPS, comprobantes, cierres, stock y sincronización de los cinco
  roles aprobados; incluye dos pedidos consecutivos a direcciones distintas,
  reporte semanal y verificación del nonce CSP.
- `npm run test:load`: 120 solicitudes, concurrencia 10, 200.5 req/s, p95 de
  373 ms y máximo de 541 ms en la prueba de humo local.
- `npm audit --omit=dev`: 0 vulnerabilidades conocidas.
- `npm run test:deployment`: login, cookie, Socket.IO, CSP y cabeceras de
  seguridad aprobados contra el servidor local.
- `npm run preflight`: verificador de requisitos de publicación implementado y
  probado con escenarios bloqueado y aprobado.
- Pruebas HTTP de origen: cookie sin origen `403`, origen externo `403` y mismo
  origen `200`.
- Portada, paneles, hoja visual, Leaflet e iconos del mapa respondieron `200`.
- `npm run backup`: backup PostgreSQL creado correctamente.
- Las cinco cuentas demo respondieron `200` y devolvieron el rol correcto.
- Servidor local comprobado en `http://localhost:3000`.

Docker no está instalado en esta máquina, pero GitHub Actions construyó
correctamente la imagen de producción definida por el `Dockerfile`.

## Pendientes para staging público

- Aprobar y fusionar el PR de publicación en `main` con GitHub Actions en verde.
- Guardar la `DATABASE_URL` completa de Supabase y una clave de Brevo o Resend en Render.
- Crear el Blueprint de Render y ejecutar `npm run test:deployment` contra su
  URL HTTPS.
- Probar el correo de verificación y recuperación con la cuenta propietaria de
  Resend. El dominio `resend.dev` no permite enviar a terceros.

El cliente Flutter de `mobile/` es experimental y no forma parte de este primer
staging. Su autenticación debe adaptarse a la sesión `HttpOnly` antes de
distribuir binarios.

## Pendientes para lanzamiento comercial

- Contratar dominio propio; Render ya proporcionará hosting y HTTPS, y Supabase
  proporcionará PostgreSQL administrado.
- Configurar almacenamiento externo y probar una restauración aislada.
- Verificar dominio y remitente en Brevo o Resend para la salida comercial.
- Completar afiliación, UAT y certificación de Kushki Ecuador.
- Incorporar razón social, RUC, domicilio y contactos legales reales.
- Obtener revisión jurídica de términos, privacidad y contratos.
- Configurar monitoreo y alertas externas.
- Ejecutar pruebas móviles, carga con el volumen comercial esperado y una
  revisión independiente de seguridad.
- Completar una revisión visual en navegador de escritorio y móvil; el navegador
  integrado no estuvo disponible durante esta sesión.

La configuración local no debe copiarse a producción. `npm run check:env`
aprueba una configuración simulada de Render y el preflight mantiene bloqueado
el lanzamiento comercial hasta configurar correo, dominio y Kushki reales.

## Archivos de referencia

- `README.md`
- `docs/PRODUCCION.md`
- `docs/ANALISIS_PRODUCTO.md`
- `docs/AUDITORIA_SEGURIDAD.md`
- `backend/.env.example`
- `frontend/legal/privacidad.html`
- `frontend/legal/terminos.html`

## Estado de trabajo

La preparación se mantiene en el PR `#2`, está fusionable y todas las
comprobaciones web, Docker, Android, Linux y Windows terminaron en verde. El
despliegue de Render se realizará desde `main` y recibirá los secretos
directamente en su panel.
