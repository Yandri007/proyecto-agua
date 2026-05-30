import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../logic/pedidos_logic.dart';
import '../../themes/app_colors.dart';
import '../../widgets/badge_widget.dart';
import '../../widgets/empty_state_widget.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/toast_widget.dart';

/// Historial de pedidos del cliente.
class HistorialPage extends HookConsumerWidget {
  const HistorialPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pedidosAsync = ref.watch(pedidosClienteControllerProvider);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(pedidosClienteControllerProvider);
      },
      child: pedidosAsync.when(
        data: (pedidos) {
          if (pedidos.isEmpty) {
            return const EmptyStateWidget(
              icon: Icons.receipt_long,
              title: 'No tienes pedidos en tu historial',
              subtitle: '¡Haz tu primer pedido desde el catálogo!',
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: pedidos.length + 1, // +1 para el botón vaciar
            itemBuilder: (context, index) {
              if (index == 0) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        '📋 Historial de Pedidos',
                        style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.w600),
                      ),
                      TextButton.icon(
                        onPressed: () => _vaciarHistorial(context, ref),
                        icon: const Icon(Icons.delete_sweep, size: 18),
                        label: const Text('Vaciar'),
                        style: TextButton.styleFrom(
                            foregroundColor: AppColors.textMuted),
                      ),
                    ],
                  ),
                );
              }

              final p = pedidos[index - 1];
              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Pedido #${p.id}',
                            style: const TextStyle(
                                fontWeight: FontWeight.w600)),
                        BadgeWidget(estado: p.estado),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text('Total: \$${p.total.toStringAsFixed(2)}'),
                    if (p.createdAt != null)
                      Text(
                        'Fecha: ${DateTime.tryParse(p.createdAt!)?.toLocal().toString().substring(0, 16) ?? ''}',
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.textMuted),
                      ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (p.estado == 'pendiente')
                          _ActionChip(
                            label: '❌ Cancelar',
                            color: AppColors.danger,
                            onTap: () => _cancelarPedido(context, ref, p.id),
                          ),
                        if (p.estado == 'entregado' && !p.confirmado)
                          _ActionChip(
                            label: '✅ Confirmar',
                            color: AppColors.success,
                            onTap: () =>
                                _confirmarRecepcion(context, ref, p.id),
                          ),
                        if (p.estado == 'entregado' || p.estado == 'cancelado')
                          _ActionChip(
                            label: '👁️ Ocultar',
                            color: AppColors.textMuted,
                            onTap: () => _ocultarPedido(context, ref, p.id),
                          ),
                      ],
                    ),
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

  void _cancelarPedido(BuildContext context, WidgetRef ref, int id) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('¿Cancelar pedido?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('No')),
          TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Sí, cancelar')),
        ],
      ),
    );
    if (confirm == true) {
      await ref
          .read(pedidosClienteControllerProvider.notifier)
          .cancelarPedido(id);
      if (context.mounted) {
        showAquaToast(context, 'Pedido cancelado');
      }
    }
  }

  void _confirmarRecepcion(BuildContext context, WidgetRef ref, int id) async {
    await ref
        .read(pedidosClienteControllerProvider.notifier)
        .confirmarRecepcion(id);
    if (context.mounted) {
      showAquaToast(context, 'Recepción confirmada ✅');
    }
  }

  void _ocultarPedido(BuildContext context, WidgetRef ref, int id) async {
    await ref
        .read(pedidosClienteControllerProvider.notifier)
        .ocultarPedido(id);
    if (context.mounted) {
      showAquaToast(context, 'Pedido ocultado');
    }
  }

  void _vaciarHistorial(BuildContext context, WidgetRef ref) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('¿Vaciar historial?'),
        content: const Text(
            'Los pedidos completados y cancelados se ocultarán de tu vista.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancelar')),
          TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Sí, vaciar')),
        ],
      ),
    );
    if (confirm == true) {
      await ref
          .read(pedidosClienteControllerProvider.notifier)
          .vaciarHistorial();
      if (context.mounted) {
        showAquaToast(context, 'Historial vaciado');
      }
    }
  }
}

class _ActionChip extends StatelessWidget {
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _ActionChip(
      {required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(label,
            style: const TextStyle(
                color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
      ),
    );
  }
}
