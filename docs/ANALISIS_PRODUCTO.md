# Análisis de AquaControl frente a operaciones reales

Fecha de revisión: 1 de agosto de 2026.

## Qué hacen las embotelladoras grandes

Una embotelladora grande no opera únicamente con pedidos y reparto. Separa
responsabilidades de producción, calidad, ingeniería/mantenimiento,
operaciones, administración, contabilidad y Recursos Humanos. Una visita
técnica publicada por la Escuela Politécnica Nacional sobre la planta de
Tesalia CBC en Machachi identifica precisamente producción, calidad,
ingeniería, operaciones y servicios, administración, contabilidad y Recursos
Humanos. [Fuente: EPN](https://webhistorico.epn.edu.ec/visita-planta-machachi-tesalia-cbc/).

Coca-Cola FEMSA informa una operación con 56 plantas, 256 centros de
distribución y más de 93.000 colaboradores. Su modelo incluye optimización de
almacenes, inventario digital, trazabilidad, formación de planta y una
plataforma de autoservicio de RR. HH. para datos personales, nómina, vacaciones,
beneficios y permisos. [Reporte integrado](https://coca-colafemsa.com/wp-content/uploads/2025/04/integrated_report_KOF-IR-2024-ENG.pdf) y
[glosario operativo](https://investors.coca-colafemsa.com/en/ir-tools/glossary.html).

Primo Brands combina entrega directa, intercambio y recarga. Sus envases
reutilizables se recuperan durante la entrega, se usan repetidamente y luego se
reciclan. Este ciclo hace que envases llenos, vacíos, depósitos y activos en
clientes sean parte central del control operativo.
[Fuente: reporte de sostenibilidad de Primo Brands](https://www.primobrands.com/wp-content/uploads/2025/05/Primo-2024-Sustainability-Report-LR-web1b.pdf).

## Qué ofrecen los SaaS especializados

Las soluciones especializadas actuales convergen en estos procesos:

- Ruta diaria, cambios durante la entrega, firma y comprobante.
- Venta directa desde el vehículo y conciliación al cierre de ruta.
- Inventario por bodega y vehículo.
- Envases retornables, depósitos, equipos prestados o alquilados.
- Pedidos recurrentes, pausas, reprogramaciones y cobro automático.
- Cuentas por cobrar, pagos, facturación e integración contable.
- Atención al cliente, comunicaciones y prueba de entrega.

RouteOS enfatiza ajustes en la puerta, envases entregados/devueltos, firmas y
registros conciliados. [RouteOS](https://getrouteos.com/). Solid Route
Accounting incluye venta desde vehículo, inventario, facturación móvil y
liquidación de ruta. [Solid Innovation](https://solid-innovation.com/pages/water-delivery-software).
Watertight amplía el alcance a almacenes, contratos, alquileres, cobranzas y
contabilidad. [Watertight](https://watertight.com/). Mile agrega carga de
vehículos, venta directa, programación recurrente, diferentes medios de pago y
cierre automatizado. [Mile](https://www.milenow.com/en/water-delivery-software/).

## Posición de AquaControl

AquaControl no debe intentar copiar de inmediato el ERP de una corporación con
cientos de centros de distribución. Su ventaja defendible es ofrecer a
distribuidoras pequeñas y medianas una operación integrada, más fácil de
adoptar, multiempresa y preparada para Ecuador.

Fortalezas actuales:

- Un solo acceso con experiencias separadas por rol.
- Aislamiento SaaS por empresa.
- Pedido, inventario, despacho, GPS y confirmación en tiempo real.
- Seguridad, auditoría y ciclo de suscripción.
- Venta en ruta con idempotencia, descuento de stock y revisión administrativa.
- Módulos opcionales de RR. HH., planta y logística, sin afectar a empresas que no los usan.
- Lotes que solo ingresan al inventario después de aprobación de calidad.
- Flota e inventario por vehículo para separar la bodega de la venta directa.
- Envases retornables, depósitos, comprobante firmado y cierre de caja por ruta.
- Pedidos permanentes semanales, quincenales o mensuales con pausa, omisión y reanudación.

Brechas prioritarias:

| Prioridad | Capacidad | Razón |
| --- | --- | --- |
| Alta | Rutas, paradas y secuenciación | Reduce kilómetros, tiempo y entregas fallidas. |
| Media | Cuentas por cobrar y factura electrónica | Convierte ventas aprobadas en contabilidad real. |
| Media | Compras, proveedores y múltiples bodegas | Necesario cuando una distribuidora escala. |
| Media | Mantenimiento de vehículos y equipos | Controla disponibilidad y costo operativo. |
| Posterior | Nómina, vacaciones y beneficios completos | Debe integrarse con un sistema laboral/contable local, no improvisarse. |
| Posterior | MES/SPC industrial completo | Solo aplica a plantas de mayor complejidad y requiere especialistas. |

## Diseño modular adoptado

Toda empresa conserva los roles base `admin`, `repartidor` y `cliente`.
Los módulos `recursos_humanos`, `planta` y `logistica` están desactivados inicialmente. El
administrador puede habilitarlos por empresa y entonces crear cuentas `rh` o
`jefe_planta`.

Deshabilitar un módulo no elimina información y no afecta pedidos, clientes,
repartidores, inventario ni administración. Las cuentas del módulo pierden
acceso hasta que vuelva a habilitarse.

El módulo inicial de RR. HH. es deliberadamente acotado: directorio, cargo,
área, fecha de ingreso, contrato, estado y notas. Nómina, beneficios, permisos
y cumplimiento laboral deben incorporarse después de definir requisitos
legales e integración contable para Ecuador.

El módulo inicial de planta administra lotes planificados, en proceso,
cancelados o completados. Un lote solo aumenta stock una vez y requiere calidad
aprobada. No sustituye todavía un sistema industrial MES, laboratorio o
mantenimiento.

El módulo logístico administra vehículos y su asignación, carga y descarga de
stock para venta directa, movimientos de envases retornables, depósitos,
comprobantes de entrega firmados y cierres diarios de efectivo. Los pedidos
planificados siguen reservando stock de bodega; únicamente las ventas nuevas
durante la ruta consumen inventario del vehículo.

Las entregas recurrentes generan pedidos normales en la fecha programada, de
modo que reutilizan inventario, despacho, GPS y comprobantes existentes. El
cliente puede cambiar frecuencia, cantidades, fecha y dirección; también puede
pausar, reanudar, omitir la siguiente visita o cancelar. Cada ejecución queda
registrada y los fallos de stock o límites del plan son visibles para cliente y
administrador.
