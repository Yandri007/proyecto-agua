# Auditoría técnica de seguridad

Fecha: 2 de agosto de 2026.

## Resultado

No se encontraron vulnerabilidades críticas o altas conocidas en las
dependencias ni fallos de autorización en las pruebas automatizadas ejecutadas.
El sistema es apto para demostración y pruebas controladas. Este resultado no
equivale a una certificación de producción ni reemplaza una prueba de
penetración independiente.

## Alcance comprobado

- Autenticación, recuperación, verificación de correo y separación por roles.
- Aislamiento multiempresa en HTTP, PostgreSQL y Socket.IO.
- Sesión en cookie `HttpOnly`, `SameSite=Strict` y `Secure` en producción.
- Rechazo de mutaciones con cookie sin origen verificable y de orígenes externos.
- Rate limiting global y específico para autenticación.
- Validación de entradas, consultas SQL parametrizadas y límites de cuerpo.
- Helmet, CSP, bloqueo de marcos, ocultamiento de `X-Powered-By` y política de
  permisos para geolocalización.
- Nonce CSP independiente por documento HTML para impedir bloques de script no
  autorizados.
- Detección del cambio de usuario o rol cuando varias pestañas comparten la
  misma cookie de sesión, con bloqueo del panel antes de continuar operando.
- Auditoría de mutaciones, logs con identificador de solicitud y métricas
  protegidas.
- Consentimiento GPS, autorización por pedido y empresa, y conservación
  configurable de ubicaciones.
- Firma de webhooks de pago y comprobación de comercio y antigüedad.
- Escaneo de secretos de alta confianza y revisión de archivos ignorados.

## Evidencia ejecutada

- `npm test`: 13 de 13 pruebas aprobadas.
- `npm run check`: 7 HTML y 5 scripts verificados.
- `npm run test:integration`: identidad, recurrencias, módulos, personal,
  planta, flota, ventas, GPS, comprobantes, cierres, stock y eventos en tiempo
  real para administrador, cliente, repartidor, RH y jefe de planta aprobados.
  Incluye dos pedidos consecutivos del mismo cliente a direcciones distintas y
  el reporte de ventas por día de semana.
- `npm run test:load`: 120 solicitudes con concurrencia 10, 179.7 req/s, p95 de
  311 ms y máximo de 406 ms en el equipo local.
- `npm audit --omit=dev`: 0 vulnerabilidades conocidas.
- Mutación con cookie sin `Origin` o `Referer`: `403`.
- Mutación desde origen externo: `403`.
- Mutación desde el mismo origen: `200`.
- Hoja visual, Leaflet, iconos del mapa y las cinco interfaces: `200`.
- Logotipo y cuatro imágenes de catálogo servidos localmente: `200`.
- Las tres imágenes optimizadas del carrusel de portada respondieron `200`.
- Monitor de conexión con aviso, reintento y actualización tras reconectar.
- `npm run preflight` bloquea despliegues sin HTTPS, orígenes, SSL, secretos,
  correo, monitoreo y pagos configurados.

## Mapa y ubicación

El flujo funcional está conectado de extremo a extremo. El repartidor debe dar
consentimiento, tener un pedido activo propio y pertenecer a la empresa. La API
valida coordenadas y el servidor emite la ubicación solo a las salas autorizadas
de cliente y administración.

Leaflet se sirve desde la propia aplicación. Los mosaicos usan el host oficial
de OpenStreetMap, muestran atribución y presentan un estado comprensible cuando
el mapa base no está disponible. La integración automatizada verificó el envío
por Socket.IO y la consulta autorizada por cliente y administrador.

## Riesgos residuales

### Prioridad media

Los bloques de script dentro del HTML ya están protegidos con un nonce distinto
por respuesta. La CSP todavía permite atributos `onclick` y estilos inline por
compatibilidad con las interfaces actuales. Antes de una exposición amplia
conviene migrar esos manejadores a `addEventListener` y extraer los estilos.

Chart.js, SheetJS, Font Awesome, Inter y Leaflet están fijados y se sirven desde
el producto. En ejecución solo permanecen como servicios externos los mosaicos
de OpenStreetMap y Kushki, que deben mantenerse según sus integraciones
oficiales.

Las firmas de entrega se almacenan como datos de imagen en PostgreSQL. Se debe
definir retención, eliminación y cifrado del almacenamiento y de sus backups
según el contrato y la legislación aplicable.

### Bloqueos de lanzamiento

- HTTPS, proxy inverso y cabeceras no se han validado en el dominio final.
- Falta ejecutar UAT en teléfonos reales con permisos GPS y pérdida de conexión.
- Falta prueba de carga con el volumen comercial esperado, recuperación aislada
  de backup y monitoreo externo. La prueba de humo local ya fue aprobada.
- Falta revisión jurídica y prueba de penetración independiente.
- Kushki y Resend requieren credenciales, certificación y dominio reales.

## Referencias

- https://expressjs.com/en/advanced/best-practice-security/
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- https://operations.osmfoundation.org/policies/tiles/
