import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../logic/reportes_logic.dart';
import '../../widgets/loading_widget.dart';

/// Página de reportes avanzados del admin.
class ReportesPage extends HookConsumerWidget {
  const ReportesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reportes = ref.watch(reportesControllerProvider);

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        reportes.when(
          data: (resumen) => Container(
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
                const Text(
                  '📊 Resumen General',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 16),
                _ReporteRow(
                    label: 'Ventas Hoy',
                    value: '\$${resumen.ventasHoy.toStringAsFixed(2)}'),
                _ReporteRow(
                    label: 'Ventas Semana',
                    value: '\$${resumen.ventasSemana.toStringAsFixed(2)}'),
                _ReporteRow(
                    label: 'Ventas Mes',
                    value: '\$${resumen.ventasMes.toStringAsFixed(2)}'),
                _ReporteRow(
                    label: 'Pedidos Pendientes',
                    value: '${resumen.pedidosPendientes}'),
                _ReporteRow(
                    label: 'Pedidos Entregados',
                    value: '${resumen.pedidosEntregados}'),
              ],
            ),
          ),
          loading: () => const LoadingWidget(),
          error: (e, _) => Text('Error: $e'),
        ),
      ],
    );
  }
}

class _ReporteRow extends StatelessWidget {
  final String label;
  final String value;
  const _ReporteRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 14)),
          Text(value,
              style:
                  const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
