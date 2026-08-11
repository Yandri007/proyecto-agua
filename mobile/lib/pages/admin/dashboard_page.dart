import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../logic/pedidos_logic.dart';
import '../../logic/reportes_logic.dart';
import '../../themes/app_colors.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/stat_card.dart';

/// Dashboard principal del admin con estadísticas y gráficos.
class DashboardPage extends HookConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reportes = ref.watch(reportesControllerProvider);
    final pedidosAsync = ref.watch(pedidosAdminControllerProvider);
    final ventasDiaSemana = ref.watch(ventasPorDiaSemanaProvider);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(reportesControllerProvider);
        ref.invalidate(pedidosAdminControllerProvider);
        ref.invalidate(ventasPorDiaSemanaProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          // Stats cards
          reportes.when(
            data: (resumen) => LayoutBuilder(
              builder: (context, constraints) {
                final crossAxisCount = constraints.maxWidth > 800 ? 4 : 2;
                return GridView.count(
                  crossAxisCount: crossAxisCount,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 16,
                  crossAxisSpacing: 16,
                  childAspectRatio: 2.2,
                  children: [
                    StatCard(
                      label: 'Ventas Hoy',
                      value: '\$${resumen.ventasHoy.toStringAsFixed(2)}',
                      icon: Icons.today,
                    ),
                    StatCard(
                      label: 'Ventas Semana',
                      value: '\$${resumen.ventasSemana.toStringAsFixed(2)}',
                      icon: Icons.date_range,
                    ),
                    StatCard(
                      label: 'Ventas Mes',
                      value: '\$${resumen.ventasMes.toStringAsFixed(2)}',
                      icon: Icons.calendar_month,
                    ),
                    StatCard(
                      label: 'Pedidos Pendientes',
                      value: '${resumen.pedidosPendientes}',
                      icon: Icons.pending_actions,
                      iconColor: AppColors.warning,
                    ),
                  ],
                );
              },
            ),
            loading: () => const LoadingWidget(),
            error: (e, _) => Text('Error: $e'),
          ),

          const SizedBox(height: 24),

          // Gráficos
          LayoutBuilder(
            builder: (context, constraints) {
              final isWide = constraints.maxWidth > 800;
              if (isWide) {
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: _buildVentasDiaSemanaChart(ventasDiaSemana)),
                    const SizedBox(width: 20),
                    Expanded(child: _buildPedidosEstadoChart(pedidosAsync)),
                  ],
                );
              }
              return Column(
                children: [
                  _buildVentasDiaSemanaChart(ventasDiaSemana),
                  const SizedBox(height: 20),
                  _buildPedidosEstadoChart(pedidosAsync),
                ],
              );
            },
          ),

          const SizedBox(height: 24),

          // Últimos pedidos
          _buildUltimosPedidos(pedidosAsync),
        ],
      ),
    );
  }

  Widget _buildVentasDiaSemanaChart(AsyncValue<List<VentaDiaSemana>> data) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.bar_chart, color: AppColors.primary, size: 20),
              SizedBox(width: 8),
              Text(
                'Ventas por Día de la Semana',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
              ),
            ],
          ),
          const SizedBox(height: 20),
          SizedBox(
            height: 250,
            child: data.when(
              data: (ventas) {
                if (ventas.isEmpty) {
                  return const Center(child: Text('Sin datos'));
                }
                return BarChart(
                  BarChartData(
                    barGroups: ventas.asMap().entries.map((entry) {
                      return BarChartGroupData(
                        x: entry.key,
                        barRods: [
                          BarChartRodData(
                            toY: entry.value.totalVentas,
                            color: AppColors.primary,
                            width: 20,
                            borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(6),
                            ),
                          ),
                        ],
                      );
                    }).toList(),
                    titlesData: FlTitlesData(
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          getTitlesWidget: (value, _) {
                            final index = value.toInt();
                            if (index < ventas.length) {
                              return Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Text(
                                  ventas[index].nombreDia.substring(0, 3),
                                  style: const TextStyle(fontSize: 11),
                                ),
                              );
                            }
                            return const SizedBox.shrink();
                          },
                        ),
                      ),
                      leftTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: true, reservedSize: 50),
                      ),
                      topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    ),
                    borderData: FlBorderData(show: false),
                    gridData: const FlGridData(show: true, drawVerticalLine: false),
                  ),
                );
              },
              loading: () => const LoadingWidget(),
              error: (e, _) => Center(child: Text('Error: $e')),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPedidosEstadoChart(AsyncValue pedidosAsync) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.pie_chart, color: AppColors.primary, size: 20),
              SizedBox(width: 8),
              Text(
                'Estado de Pedidos',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
              ),
            ],
          ),
          const SizedBox(height: 20),
          SizedBox(
            height: 250,
            child: pedidosAsync.when(
              data: (pedidos) {
                final pendientes =
                    pedidos.where((p) => p.estado == 'pendiente').length;
                final enCamino =
                    pedidos.where((p) => p.estado == 'en_camino').length;
                final entregados =
                    pedidos.where((p) => p.estado == 'entregado').length;
                final total = pendientes + enCamino + entregados;
                if (total == 0) {
                  return const Center(child: Text('Sin datos'));
                }
                return PieChart(
                  PieChartData(
                    sectionsSpace: 3,
                    centerSpaceRadius: 40,
                    sections: [
                      PieChartSectionData(
                        value: pendientes.toDouble(),
                        title: '$pendientes',
                        color: AppColors.warning,
                        radius: 60,
                        titleStyle: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 14),
                      ),
                      PieChartSectionData(
                        value: enCamino.toDouble(),
                        title: '$enCamino',
                        color: AppColors.info,
                        radius: 60,
                        titleStyle: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 14),
                      ),
                      PieChartSectionData(
                        value: entregados.toDouble(),
                        title: '$entregados',
                        color: AppColors.success,
                        radius: 60,
                        titleStyle: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 14),
                      ),
                    ],
                  ),
                );
              },
              loading: () => const LoadingWidget(),
              error: (e, _) => Center(child: Text('Error: $e')),
            ),
          ),
          const SizedBox(height: 12),
          // Leyenda
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _LegendItem(color: AppColors.warning, label: 'Pendientes'),
              _LegendItem(color: AppColors.info, label: 'En camino'),
              _LegendItem(color: AppColors.success, label: 'Entregados'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildUltimosPedidos(AsyncValue pedidosAsync) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.all(20),
            child: Row(
              children: [
                Icon(Icons.history, color: AppColors.primary, size: 20),
                SizedBox(width: 8),
                Text(
                  'Últimos Pedidos',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
                ),
              ],
            ),
          ),
          pedidosAsync.when(
            data: (pedidos) {
              final ultimos = pedidos.take(8).toList();
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  columns: const [
                    DataColumn(label: Text('ID')),
                    DataColumn(label: Text('Cliente')),
                    DataColumn(label: Text('Total')),
                    DataColumn(label: Text('Estado')),
                    DataColumn(label: Text('Fecha')),
                  ],
                  rows: ultimos.map((p) {
                    return DataRow(cells: [
                      DataCell(Text('#${p.id}')),
                      DataCell(Text(p.clienteNombre ?? 'Cliente ${p.clienteId}')),
                      DataCell(Text('\$${p.total.toStringAsFixed(2)}')),
                      DataCell(_buildEstadoBadge(p.estado)),
                      DataCell(Text(
                        p.createdAt != null
                            ? DateTime.tryParse(p.createdAt!)
                                    ?.toLocal()
                                    .toString()
                                    .substring(0, 10) ??
                                ''
                            : '',
                      )),
                    ]);
                  }).toList(),
                ),
              );
            },
            loading: () => const Padding(
              padding: EdgeInsets.all(40),
              child: LoadingWidget(),
            ),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(20),
              child: Text('Error: $e'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEstadoBadge(String estado) {
    final color = switch (estado) {
      'pendiente' => AppColors.warning,
      'en_camino' => AppColors.info,
      'entregado' => AppColors.success,
      'cancelado' => AppColors.danger,
      _ => AppColors.textMuted,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        estado,
        style: const TextStyle(
            color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class _LegendItem extends StatelessWidget {
  final Color color;
  final String label;
  const _LegendItem({required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(label, style: const TextStyle(fontSize: 12)),
      ],
    );
  }
}
