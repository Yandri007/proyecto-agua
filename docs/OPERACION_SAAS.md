# Operacion comercial de AquaControl

## Modelo recomendado

AquaControl se vende como un unico SaaS multiempresa. Cada distribuidora recibe
su propia empresa, codigo de registro, usuarios, configuracion y modulos. No se
crean copias del sistema ni bases separadas por cliente salvo que un contrato
empresarial lo exija expresamente.

El propietario del SaaS administra el negocio en `/plataforma/`. El
administrador de una distribuidora continua trabajando unicamente en `/admin/`.
Las dos sesiones, credenciales y auditorias son independientes.

## Lo que controla el propietario

- Empresas activas, suspendidas y archivadas.
- Pruebas, planes Basico y Profesional, periodos y estado de suscripcion.
- Habilitacion global del registro de clientes por empresa. El administrador
  de cada distribuidora comparte y puede renovar su propio enlace seguro.
- Modulos opcionales de ventas en ruta, Recursos Humanos, planta y logistica.
- Uso mensual, cantidad de usuarios, repartidores y ultima actividad.
- Ingreso mensual estimado y acciones realizadas desde la consola.

La consola no permite suplantar silenciosamente a un usuario. Para soporte, el
cliente debe reproducir el problema o autorizar un procedimiento documentado.

## Alta de una empresa

1. El cliente registra su distribuidora y verifica el correo del administrador.
2. La cuenta recibe 14 dias de prueba y productos iniciales.
3. El propietario revisa la nueva empresa en la consola y habilita solo los
   modulos contratados.
4. El administrador abre `Clientes` y comparte el portal unico de su empresa.
   Los consumidores se registran directamente con rol `cliente`.
5. Durante la prueba se realiza una sesion de configuracion y una prueba de
   pedido, asignacion, ruta y entrega.
6. Al contratar, se cambia a Basico o Profesional y la suscripcion a activa.
7. Si todavia no existe una pasarela de pago, el cobro puede conciliarse fuera
   de AquaControl y activarse manualmente desde la consola, dejando auditoria.

El rol `cliente` forma parte de todos los planes vigentes. No se habilita como
un modulo opcional ni requiere que el propietario entregue enlaces individuales.

## Estados operativos

- `activa`: la empresa puede iniciar sesion y operar si su prueba o suscripcion
  tambien esta vigente.
- `suspendida`: bloquea el acceso sin borrar informacion. Se usa por impago,
  seguridad o solicitud temporal.
- `archivada`: conserva historial para una empresa que dejo el servicio.
- `prueba`: acceso hasta la fecha configurada.
- `gracia`: acceso excepcional hasta el fin del periodo configurado.
- `vencida` o `cancelada`: la operacion queda bloqueada hasta regularizacion.

Nunca se elimina una empresa para resolver una baja comercial. Se archiva para
conservar trazabilidad, obligaciones de respaldo y auditoria.

## Operacion recurrente

- Diario: revisar salud, errores de correo y empresas que requieren atencion.
- Semanal: revisar pruebas proximas a vencer y actividad de nuevos clientes.
- Mensual: conciliar suscripciones, exportaciones, restauracion de respaldo y
  accesos del propietario.
- Trimestral: revisar precios, limites, modulos contratados y dependencias.

## Requisitos antes de cobrar a terceros

- Dominio propio verificado en Resend para enviar a cualquier correo.
- Terminos, privacidad, soporte, precios e impuestos definidos.
- Pasarela certificada o proceso manual de cobro y conciliacion documentado.
- Backups fuera de Render y prueba periodica de restauracion.
- Monitor externo, alertas y canal de atencion al cliente.

Render gratuito y Supabase gratuito sirven para pilotos controlados. Antes de
comprometer disponibilidad comercial se debe presupuestar infraestructura sin
pausas por inactividad, backups administrados y observabilidad.
