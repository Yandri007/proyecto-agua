# AquaControl Mobile

Este cliente Flutter vive separado de la aplicacion web de produccion. Para
compilar contra un backend desplegado, define ambas URL en el build:

> Estado: experimental. La primera publicacion comercial incluye solo el SaaS
> web. El cliente Flutter aun debe adaptar su persistencia de sesion al contrato
> `HttpOnly` del backend antes de distribuirse a usuarios.

```bash
flutter build apk --debug \
  --dart-define=API_BASE_URL=https://staging.example.com/api \
  --dart-define=SOCKET_URL=https://staging.example.com
```

**AquaControl** es una aplicación multiplataforma moderna y premium diseñada para la gestión, control y distribución de agua embotellada. Desarrollada en **Flutter**, ofrece una interfaz de usuario extremadamente fluida, animada y reactiva, adaptada para navegadores web, dispositivos móviles y escritorio. El sistema cuenta con tres roles de usuario principales (Administrador, Cliente y Repartidor) y comunicación en tiempo real para optimizar toda la cadena de suministro.

---

## 🚀 Stack Tecnológico

El frontend está construido sobre los estándares más modernos de desarrollo en Flutter, asegurando rendimiento nativo, alta mantenibilidad y un código limpio:

*   **Framework Principal:** `Flutter (Multiplataforma)`
*   **Gestión de Estado Reactiva:** `Riverpod Generator` & `Riverpod Annotation` (Uso estricto de la anotación `@riverpod` con `Notifier` y `AsyncNotifier`, sin sintaxis antigua).
*   **Gestión del Ciclo de Vida y UI:** `Flutter Hooks` (`useState`, `useEffect`, `useTextEditingController`, `useMemoized`) para evitar el boilerplate de StatefulWidgets.
*   **Modelado de Datos:** `Freezed` (`freezed_annotation`) para clases de datos, DTOs y estados complejos inmutables con soporte integrado de serialización JSON (`fromJson`/`toJson`).
*   **Enrutamiento Declarativo:** `GoRouter` para navegación segura, control de rutas dinámicas y guards de protección basados en roles de usuario.
*   **Cliente HTTP / Consumo API:** `Dio` para peticiones robustas con interceptores para inyección y renovación automática del token JWT.
*   **Sincronización en Tiempo Real:** `Socket.IO Client` para escuchar eventos del backend al instante (cambios de estado de pedidos, asignación de entregas, etc.).
*   **Visualización de Datos:** `fl_chart` para renderizar gráficos de rendimiento y ventas altamente interactivos y estilizados.
*   **Estética & Tipografía:** `Google Fonts` (Outfit/Inter) combinados con un sistema de diseño visual de vanilla CSS, colores HSL modernos, degradados sutiles y micro-animaciones premium.

---

## 📂 Estructura de Carpetas (Arquitectura Limpia)

Todo el código fuente dentro del directorio `lib/` está organizado bajo una arquitectura modular y predefinida de alta escalabilidad:

```text
lib/
├── models/         # Clases de datos, entidades DTOs construidas con @freezed
├── logic/          # Capa de negocio (Notifiers, controladores, repositorios, servicios API)
├── routes/         # Enrutamiento, GoRouter, Guards por rol y el barrel file exports.dart
├── themes/         # Constantes de colores HSL, tipografías, ThemeData y assets
├── widgets/        # Componentes visuales genéricos y altamente reutilizables (Shared UI)
└── pages/          # Pantallas principales (Views) divididas por subcarpetas de roles
    ├── admin/      # Vistas del panel de administración
    ├── cliente/    # Vistas de catálogo y compras del cliente
    └── repartidor/ # Vistas de entregas y órdenes asignadas al repartidor
```

### Reglas Clave de Desarrollo
1.  **Barrel Exports:** Centralización obligatoria de paquetes, widgets, páginas y lógica en `routes/exports.dart`.
2.  **Lógica Separada:** La UI nunca interactúa con la base de datos o APIs directamente; siempre despacha acciones a través de los controladores de Riverpod ubicados en `logic/`.
3.  **Vistas Reactivas:** Todas las pantallas con estados dinámicos heredan de `HookConsumerWidget` y definen el método `build(BuildContext context, WidgetRef ref)`.

---

## 👥 Roles de Usuario y Funcionalidades

El frontend está optimizado con flujos de trabajo específicos para cada perfil de usuario:

### 👑 1. Panel de Administración (Admin)
*   **Dashboard Interactivo:** Panel de control premium con KPIs clave en tiempo real (Ventas totales, pedidos activos, stock disponible). Gráficos estadísticos dinámicos de ventas mensuales.
*   **Gestión de Inventario:** Control en tiempo real de botellones y dispensadores de agua. Actualización instantánea de stock y alertas visuales de inventario bajo.
*   **Monitoreo y Asignación:** Visualización centralizada de todos los pedidos entrantes. Asignación rápida de pedidos a repartidores disponibles.
*   **Control de Repartidores:** Listado interactivo de repartidores con su estado actual de ocupación. *Para la Fase 2:* Seguimiento dinámico de trayecto simulado entre dos puntos GPS.
*   **Reportes de Desempeño:** Sección analítica avanzada con filtros para exportar o evaluar las entregas realizadas por período de tiempo.

### 🛍️ 2. Portal del Cliente
*   **Catálogo de Productos:** Vista moderna y visualmente atractiva de los productos disponibles (botellones de diferentes litros, dispensadores y accesorios).
*   **Carrito de Compras Incorporado:** Flujo ágil para añadir, modificar cantidades y eliminar productos con cálculo automático en tiempo real del total del pedido.
*   **Historial de Pedidos:** Listado detallado de todas las compras anteriores con su estado visualizado de forma interactiva (Pendiente, En camino, Entregado, Cancelado).

### 🚚 3. Aplicación del Repartidor
*   **Pedidos Asignados:** Lista optimizada de los pedidos que el administrador le ha asignado para el día, ordenada cronológica o geográficamente.
*   **Actualización de Estado en Tiempo Real:** Botones con micro-interacciones para cambiar el estado del pedido a *En camino*, *Entregado* o *Cancelado*, enviando notificaciones inmediatas al cliente y al administrador.
*   **Historial de Ventas Personales:** Resumen financiero del repartidor que detalla las entregas completadas con éxito y el dinero recaudado en el día.

---

## 🛠️ Cómo Iniciar el Proyecto

Sigue estos sencillos pasos para configurar y ejecutar el frontend de AquaControl localmente:

### Prerrequisitos
*   Tener instalado el SDK de Flutter (versión estable recomendada).
*   Contar con un simulador (Android/iOS) o navegador web (Chrome/Edge).

### 1. Instalar Dependencias
Accede a la carpeta del proyecto y ejecuta:
```bash
flutter pub get
```

### 2. Generación de Código (¡CRÍTICO!)
Este proyecto utiliza `freezed` y `riverpod_generator` para la inyección de dependencias y modelos. **Es obligatorio generar estos archivos** antes de ejecutar la aplicación.

> [!IMPORTANT]
> Ejecuta el siguiente comando en tu terminal para generar la lógica y los modelos necesarios:
```bash
dart run build_runner build --delete-conflicting-outputs
```

### 3. Ejecutar la Aplicación
Una vez finalizada la generación de código, inicia la aplicación en tu navegador web o emulador:
```bash
flutter run -d chrome
```

---

## 🎨 Principios de Diseño Visual
*   **Estética Glassmorphism:** Uso sutil de transparencias con desenfoque de fondo en modales y tarjetas para un acabado sofisticado.
*   **Colores Premium:** Paletas de HSL basadas en tonos azules cristalinos, grises oscuros elegantes y acentos vibrantes de éxito/alerta en lugar de colores primarios simples.
*   **Micro-animaciones:** Efectos de escalado ligeros en botones al pasar el cursor (hover), transiciones fluidas en el catálogo y cargas animadas elegantes.
