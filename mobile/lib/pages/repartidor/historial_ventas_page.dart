import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../logic/auth_logic.dart';
import '../../logic/reportes_logic.dart';
import '../../themes/app_colors.dart';
import '../../widgets/empty_state_widget.dart';
import '../../widgets/loading_widget.dart';

/// Historial de ventas del repartidor con tabla de totales por día.
class HistorialVentasPage extends HookConsumerWidget {
  const HistorialVentasPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authControllerProvider);
    final userId = authState.valueOrNull?.id;

    if (userId == null) {
      return const Center(child: Text('Error: Usuario no autenticado'));
    }

    final historialAsync =
        ref.watch(historialVentasRepartidorProvider(userId));

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(historialVentasRepartidorProvider(userId));
      },
      child: historialAsync.when(
        data: (ventas) {
          if (ventas.isEmpty) {
            return const EmptyStateWidget(
              icon: Icons.bar_chart,
              title: 'No hay ventas registradas',
              subtitle: 'Empieza a entregar pedidos para ver tu historial',
            );
          }

          double totalGeneral = 0;
          int totalPedidos = 0;
          for (final v in ventas) {
            totalGeneral += v.totalVentas;
            totalPedidos += v.totalPedidos;
          }

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                '📊 Mi Historial de Ventas',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 16),
              Container(
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
                      DataColumn(label: Text('Fecha')),
                      DataColumn(label: Text('Pedidos'), numeric: true),
                      DataColumn(label: Text('Total'), numeric: true),
                    ],
                    rows: [
                      ...ventas.map((v) => DataRow(cells: [
                            DataCell(Text(
                              DateTime.tryParse(v.fecha)
                                      ?.toLocal()
                                      .toString()
                                      .substring(0, 10) ??
                                  v.fecha,
                            )),
                            DataCell(Text('${v.totalPedidos}')),
                            DataCell(Text(
                              '\$${v.totalVentas.toStringAsFixed(2)}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                color: AppColors.success,
                              ),
                            )),
                          ])),
                      // Fila total
                      DataRow(
                        color: WidgetStateProperty.all(
                            AppColors.secondary),
                        cells: [
                          const DataCell(Text('TOTAL',
                              style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white))),
                          DataCell(Text('$totalPedidos',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white))),
                          DataCell(Text(
                              '\$${totalGeneral.toStringAsFixed(2)}',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white))),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
        loading: () => const LoadingWidget(),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}
