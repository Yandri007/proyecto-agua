# Piloto comercial sin dominio

Este modo permite demostrar AquaControl y operar pruebas controladas antes de
contratar dominio, correo autenticado y hosting permanente. No equivale a una
puesta en producción con acuerdo de disponibilidad.

## Alcance recomendado

- Una o dos distribuidoras simultáneas.
- Prueba de 14 días y pocos usuarios por empresa.
- Alta, soporte y cobro coordinados directamente por el propietario.
- Sin prometer disponibilidad continua mientras se use Render gratuito.

## Activar la empresa y su personal

1. Confirmar con la persona que el correo registrado le pertenece.
2. Entrar en `https://aquacontrol-saas.onrender.com/plataforma/`.
3. Abrir `Activaciones` y localizar la cuenta pendiente.
4. Seleccionar `Crear acceso`, indicar el canal utilizado y confirmar la
   identidad.
5. Copiar el enlace privado y entregarlo únicamente a esa persona.
6. Pedirle que lo abra dentro de 60 minutos y defina su propia contraseña.

El enlace funciona una sola vez. Generar otro invalida el anterior. AquaControl
no guarda el enlace en la auditoría; registra quién lo generó, para qué usuario,
la empresa, el canal de confirmación y la duración.

Este procedimiento es para el administrador y las cuentas internas que
requieran activación asistida. El propietario de AquaControl no debe repetirlo
por cada consumidor de la distribuidora.

## Incorporar clientes de la distribuidora

1. El administrador entra a `/admin/` y abre `Clientes`.
2. Copia el enlace del portal y lo comparte por el canal habitual de su negocio.
3. El consumidor abre el enlace y crea su cuenta. El servidor fija el rol
   `cliente`; el formulario no permite solicitar permisos administrativos.
4. La sesión de cliente se inicia al terminar y queda limitada a su empresa.
5. El administrador puede suspender o reactivar la cuenta desde el mismo módulo.

El enlace sirve para todos los clientes mientras la empresa esté activa y su
prueba o suscripción siga vigente. `Clientes` está disponible en cualquier plan
y no depende de los módulos opcionales. Si el enlace se comparte fuera del
público esperado, el administrador selecciona `Renovar enlace`; el anterior
queda invalidado inmediatamente y las cuentas existentes no se borran.

## Correo gratuito opcional

Brevo permite automatizar verificaciones durante el piloto:

```env
EMAIL_PROVIDER=auto
BREVO_API_KEY=xkeysib-...
EMAIL_FROM=AquaControl <correo-verificado@example.com>
EMAIL_REPLY_TO=Soporte AquaControl <correo-verificado@example.com>
```

Al añadir `BREVO_API_KEY`, `auto` lo prioriza. Si se retira, la aplicación vuelve
a Resend cuando exista `RESEND_API_KEY`. Nunca se deben publicar estas claves en
GitHub, mensajes o capturas.

## Paso a servicio comercial

La primera venta debe financiar, en este orden, un dominio propio, la
autenticación DKIM/DMARC del remitente, hosting sin suspensión y un respaldo
externo probado. Antes de habilitar pagos automáticos también se requieren la
identidad legal del negocio, términos, privacidad y la configuración comercial
de Kushki.
