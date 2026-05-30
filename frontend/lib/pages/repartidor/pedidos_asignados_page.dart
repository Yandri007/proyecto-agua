import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../logic/auth_logic.dart';
import '../../logic/pedidos_logic.dart';
import '../../themes/app_colors.dart';
import '../../widgets/aqua_button.dart';
import '../../widgets/badge_widget.dart';
import '../../widgets/empty_state_widget.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/toast_widget.dart';

/// Pedidos asignados al repartidor.
class PedidosAsignadosPage extends HookConsumerWidget {
  const PedidosAsignadosPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authControllerProvider);
    final userId = authState.valueOrNull?.id;

    if (userId == null) {
      return const Center(child: Text('Error: Usuario no autenticado'));
    }

    final pedidosAsync =
        ref.watch(pedidosRepartidorControllerProvider(userId));

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(pedidosRepartidorControllerProvider(userId));
      },
      child: pedidosAsync.when(
        data: (pedidos) {
          if (pedidos.isEmpty) {
            return const EmptyStateWidget(
              icon: Icons.inbox,
              title: 'No tienes pedidos asignados',
              subtitle: 'Espera a que el admin te asigne uno',
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: pedidos.length,
            itemBuilder: (context, index) {
              final p = pedidos[index];
              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: const Border(
                    left: BorderSide(color: AppColors.danger, width: 4),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.05),
                      blurRadius: 8,
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Pedido #${p.id}',
                            style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                color: AppColors.danger)),
                        BadgeWidget(estado: p.estado),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(Icons.person, size: 16,
                            color: AppColors.textMuted),
                        const SizedBox(width: 4),
                        Text(
                            'Cliente: ${p.clienteNombre ?? 'Cliente #${p.clienteId}'}'),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(Icons.attach_money, size: 16,
                            color: AppColors.textMuted),
                        const SizedBox(width: 4),
                        Text('Total: \$${p.total.toStringAsFixed(2)}'),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(Icons.location_on, size: 16,
                            color: AppColors.textMuted),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            'Dirección: ${p.direccionEntrega ?? 'No especificada'}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    if (p.estado != 'entregado') ...[
                      const SizedBox(height: 16),
                      AquaButton(
                        text: '✅ Confirmar Entrega',
                        variant: AquaButtonVariant.success,
                        fullWidth: true,
                        onPressed: () async {
                          final confirm = await showDialog<bool>(
                            context: context,
                            builder: (_) => AlertDialog(
                              title: const Text(
                                  '¿Confirmar entrega al cliente?'),
                              actions: [
                                TextButton(
                                    onPressed: () =>
                                        Navigator.pop(context, false),
                                    child: const Text('No')),
                                TextButton(
                                    onPressed: () =>
                                        Navigator.pop(context, true),
                                    child: const Text('Sí, entregado')),
                              ],
                            ),
                          );
                          if (confirm == true) {
                            await ref
                                .read(pedidosRepartidorControllerProvider(
                                        userId)
                                    .notifier)
                                .entregarPedido(p.id);
                            if (context.mounted) {
                              showAquaToast(
                                  context, '✅ Pedido entregado');
                            }
                          }
                        },
                      ),
                    ],
                  ],
                ),
              );
            },
          );
        },
        loading: () => const LoadingWidget(),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}
