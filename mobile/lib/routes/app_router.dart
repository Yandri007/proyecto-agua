import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../logic/auth_logic.dart';
import '../pages/admin/admin_shell_page.dart';
import '../pages/admin/dashboard_page.dart';
import '../pages/admin/inventario_page.dart';
import '../pages/admin/pedidos_page.dart';
import '../pages/admin/repartidores_page.dart';
import '../pages/admin/reportes_page.dart';
import '../pages/cliente/catalogo_page.dart';
import '../pages/cliente/cliente_shell_page.dart';
import '../pages/cliente/historial_page.dart';
import '../pages/login_page.dart';
import '../pages/register_page.dart';
import '../pages/repartidor/historial_ventas_page.dart';
import '../pages/repartidor/pedidos_asignados_page.dart';
import '../pages/repartidor/repartidor_shell_page.dart';
import '../pages/splash_page.dart';
import 'app_routes.dart';

part 'app_router.g.dart';

/// Provider del GoRouter con guards de autenticación por rol.
@Riverpod(keepAlive: true)
GoRouter appRouter(AppRouterRef ref) {
  final authState = ref.watch(authControllerProvider);

  return GoRouter(
    initialLocation: AppRoutes.splash,
    debugLogDiagnostics: true,
    redirect: (context, state) {
      final isLoggedIn = authState.valueOrNull != null;
      final userRol = authState.valueOrNull?.rol;
      final currentPath = state.uri.toString();

      // Permitir splash siempre
      if (currentPath == AppRoutes.splash) return null;

      // Si no está logueado, solo permitir login y register
      if (!isLoggedIn) {
        if (currentPath == AppRoutes.login ||
            currentPath == AppRoutes.register) {
          return null;
        }
        return AppRoutes.login;
      }

      // Si está en login/register y ya está logueado, redirigir
      if (currentPath == AppRoutes.login ||
          currentPath == AppRoutes.register) {
        switch (userRol) {
          case 'admin':
            return AppRoutes.adminDashboard;
          case 'cliente':
            return AppRoutes.clienteCatalogo;
          case 'repartidor':
            return AppRoutes.repartidorPedidos;
        }
      }

      // Proteger rutas por rol
      if (currentPath.startsWith('/admin') && userRol != 'admin') {
        return AppRoutes.login;
      }
      if (currentPath.startsWith('/cliente') && userRol != 'cliente') {
        return AppRoutes.login;
      }
      if (currentPath.startsWith('/repartidor') && userRol != 'repartidor') {
        return AppRoutes.login;
      }

      return null;
    },
    routes: [
      // Splash
      GoRoute(
        path: AppRoutes.splash,
        builder: (context, state) => const SplashPage(),
      ),

      // Auth
      GoRoute(
        path: AppRoutes.login,
        builder: (context, state) => const LoginPage(),
      ),
      GoRoute(
        path: AppRoutes.register,
        builder: (context, state) => const RegisterPage(),
      ),

      // Admin (con shell)
      ShellRoute(
        builder: (context, state, child) => AdminShellPage(child: child),
        routes: [
          GoRoute(
            path: AppRoutes.adminDashboard,
            builder: (context, state) => const DashboardPage(),
          ),
          GoRoute(
            path: AppRoutes.adminPedidos,
            builder: (context, state) => const PedidosPage(),
          ),
          GoRoute(
            path: AppRoutes.adminInventario,
            builder: (context, state) => const InventarioPage(),
          ),
          GoRoute(
            path: AppRoutes.adminRepartidores,
            builder: (context, state) => const RepartidoresPage(),
          ),
          GoRoute(
            path: AppRoutes.adminReportes,
            builder: (context, state) => const ReportesPage(),
          ),
        ],
      ),

      // Cliente (con shell)
      ShellRoute(
        builder: (context, state, child) => ClienteShellPage(child: child),
        routes: [
          GoRoute(
            path: AppRoutes.clienteCatalogo,
            builder: (context, state) => const CatalogoPage(),
          ),
          GoRoute(
            path: AppRoutes.clienteHistorial,
            builder: (context, state) => const HistorialPage(),
          ),
        ],
      ),

      // Repartidor (con shell)
      ShellRoute(
        builder: (context, state, child) =>
            RepartidorShellPage(child: child),
        routes: [
          GoRoute(
            path: AppRoutes.repartidorPedidos,
            builder: (context, state) => const PedidosAsignadosPage(),
          ),
          GoRoute(
            path: AppRoutes.repartidorHistorial,
            builder: (context, state) => const HistorialVentasPage(),
          ),
        ],
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.red),
            const SizedBox(height: 16),
            Text('Página no encontrada: ${state.uri}'),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => context.go(AppRoutes.splash),
              child: const Text('Volver al inicio'),
            ),
          ],
        ),
      ),
    ),
  );
}
