/// Constantes de rutas de la aplicación.
class AppRoutes {
  AppRoutes._();

  // Auth
  static const String splash = '/';
  static const String login = '/login';
  static const String register = '/register';

  // Cliente
  static const String clienteHome = '/cliente';
  static const String clienteCatalogo = '/cliente/catalogo';
  static const String clienteHistorial = '/cliente/historial';

  // Admin
  static const String adminHome = '/admin';
  static const String adminDashboard = '/admin/dashboard';
  static const String adminPedidos = '/admin/pedidos';
  static const String adminInventario = '/admin/inventario';
  static const String adminRepartidores = '/admin/repartidores';
  static const String adminReportes = '/admin/reportes';

  // Repartidor
  static const String repartidorHome = '/repartidor';
  static const String repartidorPedidos = '/repartidor/pedidos';
  static const String repartidorHistorial = '/repartidor/historial';
}
