import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../logic/pedidos_logic.dart';
import '../../logic/repartidores_logic.dart';
import '../../themes/app_colors.dart';
import '../../widgets/badge_widget.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/toast_widget.dart';

/// Página de gestión de pedidos del admin con filtros.
class PedidosPage extends HookConsumerWidget {
  const PedidosPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pedidosAsync = ref.watch(pedidosAdminControllerProvider);
    final repartidoresAsync = ref.watch(repartidoresControllerProvider);
    final filtroEstado = useState<String?>(null);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(pedidosAdminControllerProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          // Filtros
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.05),
                  blurRadius: 8,
                ),
              ],
            ),
            child: Wrap(
              spacing: 12,
              runSpacing: 12,
              alignment: WrapAlignment.start,
              children: [
                _buildFilterChip('Todos', null, filtroEstado),
                _buildFilterChip('Pendiente', 'pendiente', filtroEstado),
                _buildFilterChip('En camino', 'en_camino', filtroEstado),
                _buildFilterChip('Entregado', 'entregado', filtroEstado),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Tabla de pedidos
          pedidosAsync.when(
            data: (pedidos) {
              var filtered = pedidos;
              if (filtroEstado.value != null) {
                filtered = pedidos
                    .where((p) => p.estado == filtroEstado.value)
                    .toList();
              }

              if (filtered.isEmpty) {
                return const Center(
                  child: Padding(
                    padding: EdgeInsets.all(40),
                    child: Text('No hay pedidos con este filtro'),
                  ),
                );
              }

              return Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.05),
                      blurRadius: 8,
                    ),
                  ],
                ),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    columns: const [
                      DataColumn(label: Text('ID')),
                      DataColumn(label: Text('Cliente')),
                      DataColumn(label: Text('Total')),
                      DataColumn(label: Text('Estado')),
                      DataColumn(label: Text('Fecha')),
                      DataColumn(label: Text('Acción')),
                    ],
                    rows: filtered.map((p) {
                      return DataRow(cells: [
                        DataCell(Text('#${p.id}')),
                        DataCell(Text(
                            p.clienteNombre ?? 'Cliente ${p.clienteId}')),
                        DataCell(Text('\$${p.total.toStringAsFixed(2)}')),
                        DataCell(BadgeWidget(estado: p.estado)),
                        DataCell(Text(
                          p.createdAt != null
                              ? DateTime.tryParse(p.createdAt!)
                                      ?.toLocal()
                                      .toString()
                                      .substring(0, 10) ??
                                  ''
                              : '',
                        )),
                        DataCell(
                          p.estado == 'pendiente'
                              ? repartidoresAsync.when(
                                  data: (repartidores) =>
                                      _buildAsignarDropdown(
                                    context,
                                    ref,
                                    p.id,
                                    repartidores,
                                  ),
                                  loading: () => const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2),
                                  ),
                                  error: (e, _) => const Text('Error'),
                                )
                              : const Text('—'),
                        ),
                      ]);
                    }).toList(),
                  ),
                ),
              );
            },
            loading: () => const LoadingWidget(),
            error: (e, _) => Text('Error: $e'),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(
      String label, String? value, ValueNotifier<String?> filtroEstado) {
    final isSelected = filtroEstado.value == value;
    return ChoiceChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) => filtroEstado.value = value,
      selectedColor: AppColors.primary,
      labelStyle: TextStyle(
        color: isSelected ? Colors.white : AppColors.textPrimary,
        fontWeight: FontWeight.w500,
      ),
    );
  }

  Widget _buildAsignarDropdown(
    BuildContext context,
    WidgetRef ref,
    int pedidoId,
    List repartidores,
  ) {
    return PopupMenuButton<int>(
      tooltip: 'Asignar repartidor',
      icon: const Icon(Icons.person_add, color: AppColors.primary),
      onSelected: (repartidorId) async {
        try {
          await ref
              .read(pedidosAdminControllerProvider.notifier)
              .asignarRepartidor(pedidoId, repartidorId);
          if (context.mounted) {
            showAquaToast(context, '✅ Pedido asignado');
          }
        } catch (e) {
          if (context.mounted) {
            showAquaToast(context, 'Error al asignar',
                type: AquaToastType.error);
          }
        }
      },
      itemBuilder: (_) => repartidores.map((r) {
        return PopupMenuItem<int>(
          value: r.id,
          child: Text(r.nombre),
        );
      }).toList(),
    );
  }
}
