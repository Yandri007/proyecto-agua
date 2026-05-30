import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../logic/auth_logic.dart';
import '../../routes/app_routes.dart';
import '../../themes/app_colors.dart';

/// Shell page del admin con sidebar/navigation rail responsivo.
class AdminShellPage extends HookConsumerWidget {
  final Widget child;

  const AdminShellPage({super.key, required this.child});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authControllerProvider);
    final userName = authState.valueOrNull?.nombre ?? 'Admin';
    final isWide = MediaQuery.of(context).size.width > 800;
    final currentPath = GoRouterState.of(context).uri.toString();

    final menuItems = [
      _MenuItem(Icons.dashboard, 'Dashboard', AppRoutes.adminDashboard),
      _MenuItem(Icons.shopping_cart, 'Pedidos', AppRoutes.adminPedidos),
      _MenuItem(Icons.inventory_2, 'Inventario', AppRoutes.adminInventario),
      _MenuItem(Icons.local_shipping, 'Repartidores', AppRoutes.adminRepartidores),
      _MenuItem(Icons.bar_chart, 'Reportes', AppRoutes.adminReportes),
    ];

    if (isWide) {
      // Desktop/tablet: sidebar
      return Scaffold(
        body: Row(
          children: [
            // Sidebar
            Container(
              width: 260,
              decoration: const BoxDecoration(
                gradient: AppColors.sidebarGradient,
              ),
              child: Column(
                children: [
                  // Header
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 12),
                        const Row(
                          children: [
                            Text('💧', style: TextStyle(fontSize: 28)),
                            SizedBox(width: 8),
                            Text(
                              'Aqua',
                              style: TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                            Text(
                              'Control',
                              style: TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w800,
                                color: AppColors.primaryLight,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Administrador',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.6),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Divider(color: Colors.white.withValues(alpha: 0.1), height: 1),
                  const SizedBox(height: 12),

                  // Menu items
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      children: menuItems.map((item) {
                        final isActive = currentPath == item.route;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: ListTile(
                            leading: Icon(
                              item.icon,
                              color: isActive
                                  ? Colors.white
                                  : Colors.white.withValues(alpha: 0.6),
                              size: 20,
                            ),
                            title: Text(
                              item.label,
                              style: TextStyle(
                                color: isActive
                                    ? Colors.white
                                    : Colors.white.withValues(alpha: 0.6),
                                fontWeight:
                                    isActive ? FontWeight.w600 : FontWeight.w400,
                              ),
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            tileColor: isActive
                                ? AppColors.secondary.withValues(alpha: 0.5)
                                : Colors.transparent,
                            onTap: () => context.go(item.route),
                          ),
                        );
                      }).toList(),
                    ),
                  ),

                  // Logout
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: ListTile(
                      leading: Icon(Icons.logout,
                          color: Colors.white.withValues(alpha: 0.6), size: 20),
                      title: Text('Salir',
                          style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.6))),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                      onTap: () {
                        ref.read(authControllerProvider.notifier).logout();
                        context.go(AppRoutes.login);
                      },
                    ),
                  ),
                ],
              ),
            ),

            // Main content
            Expanded(
              child: Column(
                children: [
                  // Top bar
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 24, vertical: 16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.05),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.dashboard, color: AppColors.primary),
                        const SizedBox(width: 8),
                        const Text(
                          'Panel de Control',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const Spacer(),
                        Row(
                          children: [
                            const Icon(Icons.account_circle,
                                color: AppColors.textMuted),
                            const SizedBox(width: 8),
                            Text(
                              userName,
                              style: const TextStyle(
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: child,
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    // Mobile: bottom nav
    final currentIndex = menuItems.indexWhere((m) => currentPath == m.route);
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const Text('💧', style: TextStyle(fontSize: 24)),
            const SizedBox(width: 8),
            ShaderMask(
              shaderCallback: (bounds) =>
                  AppColors.primaryGradient.createShader(bounds),
              child: const Text(
                'AquaControl',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: IconButton(
              icon: const Icon(Icons.logout),
              onPressed: () {
                ref.read(authControllerProvider.notifier).logout();
                context.go(AppRoutes.login);
              },
            ),
          ),
        ],
      ),
      body: child,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: currentIndex >= 0 ? currentIndex : 0,
        onTap: (index) => context.go(menuItems[index].route),
        items: menuItems
            .map((item) => BottomNavigationBarItem(
                  icon: Icon(item.icon),
                  label: item.label,
                ))
            .toList(),
      ),
    );
  }
}

class _MenuItem {
  final IconData icon;
  final String label;
  final String route;
  _MenuItem(this.icon, this.label, this.route);
}
