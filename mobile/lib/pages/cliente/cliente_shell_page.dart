import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../logic/auth_logic.dart';
import '../../routes/app_routes.dart';
import '../../themes/app_colors.dart';

/// Shell page del cliente con bottom navigation.
class ClienteShellPage extends HookConsumerWidget {
  final Widget child;

  const ClienteShellPage({super.key, required this.child});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authControllerProvider);
    final userName = authState.valueOrNull?.nombre ?? 'Usuario';
    final currentPath = GoRouterState.of(context).uri.toString();

    final tabs = [
      _Tab(Icons.store, 'Catálogo', AppRoutes.clienteCatalogo),
      _Tab(Icons.history, 'Historial', AppRoutes.clienteHistorial),
    ];

    final currentIndex =
        tabs.indexWhere((t) => currentPath == t.route);

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
          Container(
            margin: const EdgeInsets.only(right: 8),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              children: [
                const Icon(Icons.person, size: 16, color: AppColors.primary),
                const SizedBox(width: 4),
                Text(
                  userName,
                  style: const TextStyle(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w500,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.logout, color: AppColors.danger),
            onPressed: () {
              ref.read(authControllerProvider.notifier).logout();
              context.go(AppRoutes.login);
            },
          ),
        ],
      ),
      body: child,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: currentIndex >= 0 ? currentIndex : 0,
        onTap: (index) => context.go(tabs[index].route),
        items: tabs
            .map((t) =>
                BottomNavigationBarItem(icon: Icon(t.icon), label: t.label))
            .toList(),
      ),
    );
  }
}

class _Tab {
  final IconData icon;
  final String label;
  final String route;
  _Tab(this.icon, this.label, this.route);
}
