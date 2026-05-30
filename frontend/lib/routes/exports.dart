// ============================================================
// BARREL FILE: Centraliza las exportaciones del proyecto.
// Importa este archivo en vez de cada archivo individual.
// ============================================================

// === Paquetes externos ===
export 'package:flutter_riverpod/flutter_riverpod.dart';
export 'package:hooks_riverpod/hooks_riverpod.dart';
export 'package:flutter_hooks/flutter_hooks.dart';
export 'package:go_router/go_router.dart';

// === Themes ===
export '../themes/app_colors.dart';
export '../themes/app_theme.dart';
export '../themes/app_typography.dart';
export '../themes/app_assets.dart';

// === Routes ===
export 'app_routes.dart';
export 'app_router.dart';

// === Models ===
export '../models/user_model.dart';
export '../models/producto_model.dart';
export '../models/pedido_model.dart';
export '../models/auth_response_model.dart';

// === Logic ===
export '../logic/api_service.dart';
export '../logic/auth_logic.dart';
export '../logic/productos_logic.dart';
export '../logic/pedidos_logic.dart';
export '../logic/repartidores_logic.dart';
export '../logic/reportes_logic.dart';
export '../logic/carrito_logic.dart';
export '../logic/socket_logic.dart';

// === Widgets ===
export '../widgets/aqua_button.dart';
export '../widgets/aqua_text_field.dart';
export '../widgets/aqua_card.dart';
export '../widgets/stat_card.dart';
export '../widgets/badge_widget.dart';
export '../widgets/toast_widget.dart';
export '../widgets/loading_widget.dart';
export '../widgets/empty_state_widget.dart';

// === Pages ===
export '../pages/splash_page.dart';
export '../pages/login_page.dart';
export '../pages/register_page.dart';
export '../pages/admin/admin_shell_page.dart';
export '../pages/admin/dashboard_page.dart';
export '../pages/admin/pedidos_page.dart';
export '../pages/admin/inventario_page.dart';
export '../pages/admin/repartidores_page.dart';
export '../pages/admin/reportes_page.dart';
export '../pages/cliente/cliente_shell_page.dart';
export '../pages/cliente/catalogo_page.dart';
export '../pages/cliente/historial_page.dart';
export '../pages/repartidor/repartidor_shell_page.dart';
export '../pages/repartidor/pedidos_asignados_page.dart';
export '../pages/repartidor/historial_ventas_page.dart';
