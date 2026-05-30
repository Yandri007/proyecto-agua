import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../logic/auth_logic.dart';
import '../../routes/app_routes.dart';
import '../../themes/app_colors.dart';

/// Shell page del repartidor.
class RepartidorShellPage extends HookConsumerWidget {
  final Widget child;

  const RepartidorShellPage({super.key, required this.child});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authControllerProvider);
    final userName = authState.valueOrNull?.nombre ?? 'Repartidor';
    final currentPath = GoRouterState.of(context).uri.toString();

    final tabs = [
      _Tab(Icons.assignment, 'Pedidos', AppRoutes.repartidorPedidos),
      _Tab(Icons.bar_chart, 'Historial', AppRoutes.repartidorHistorial),
    ];

    final currentIndex = tabs.indexWhere((t) => currentPath == t.route);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const Text('🚚', style: TextStyle(fontSize: 24)),
            const SizedBox(width: 8),
            Text(
              'Hola, $userName',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ],
        ),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 8),
            child: Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: const BoxDecoration(
                    color: AppColors.success,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                const Text('Conectado',
                    style: TextStyle(fontSize: 12, color: AppColors.success)),
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
