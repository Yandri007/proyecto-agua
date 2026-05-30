import 'dart:async';

import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'api_service.dart';

part 'reportes_logic.g.dart';

/// Modelo simple para resumen rápido del dashboard.
class ResumenRapido {
  final double ventasHoy;
  final double ventasSemana;
  final double ventasMes;
  final int pedidosPendientes;
  final int pedidosEntregados;

  ResumenRapido({
    required this.ventasHoy,
    required this.ventasSemana,
    required this.ventasMes,
    required this.pedidosPendientes,
    required this.pedidosEntregados,
  });

  factory ResumenRapido.fromJson(Map<String, dynamic> json) {
    return ResumenRapido(
      ventasHoy: double.tryParse('${json['ventas_hoy']}') ?? 0,
      ventasSemana: double.tryParse('${json['ventas_semana']}') ?? 0,
      ventasMes: double.tryParse('${json['ventas_mes']}') ?? 0,
      pedidosPendientes: int.tryParse('${json['pedidos_pendientes']}') ?? 0,
      pedidosEntregados: int.tryParse('${json['pedidos_entregados']}') ?? 0,
    );
  }
}

/// Modelo para ventas por día de la semana.
class VentaDiaSemana {
  final String nombreDia;
  final double totalVentas;
  final int totalPedidos;

  VentaDiaSemana({
    required this.nombreDia,
    required this.totalVentas,
    required this.totalPedidos,
  });

  factory VentaDiaSemana.fromJson(Map<String, dynamic> json) {
    return VentaDiaSemana(
      nombreDia: json['nombre_dia'] ?? '',
      totalVentas: double.tryParse('${json['total_ventas']}') ?? 0,
      totalPedidos: int.tryParse('${json['total_pedidos']}') ?? 0,
    );
  }
}

/// Modelo para ventas por día del mes.
class VentaDiaMes {
  final int dia;
  final double totalVentas;
  final int totalPedidos;

  VentaDiaMes({
    required this.dia,
    required this.totalVentas,
    required this.totalPedidos,
  });

  factory VentaDiaMes.fromJson(Map<String, dynamic> json) {
    return VentaDiaMes(
      dia: int.tryParse('${json['dia']}') ?? 0,
      totalVentas: double.tryParse('${json['total_ventas']}') ?? 0,
      totalPedidos: int.tryParse('${json['total_pedidos']}') ?? 0,
    );
  }
}

/// Modelo para historial de ventas del repartidor.
class VentaRepartidorDia {
  final String fecha;
  final int totalPedidos;
  final double totalVentas;

  VentaRepartidorDia({
    required this.fecha,
    required this.totalPedidos,
    required this.totalVentas,
  });

  factory VentaRepartidorDia.fromJson(Map<String, dynamic> json) {
    return VentaRepartidorDia(
      fecha: json['fecha'] ?? '',
      totalPedidos: int.tryParse('${json['total_pedidos']}') ?? 0,
      totalVentas: double.tryParse('${json['total_ventas']}') ?? 0,
    );
  }
}

/// Controlador de reportes (admin).
@riverpod
class ReportesController extends _$ReportesController {
  @override
  FutureOr<ResumenRapido> build() async {
    return _fetchResumen();
  }

  Future<ResumenRapido> _fetchResumen() async {
    final api = ref.read(apiServiceProvider);
    final response = await api.get('/pedidos/reporte/resumen-rapido');
    return ResumenRapido.fromJson(response.data);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchResumen());
  }
}

/// Provider para ventas por día de la semana.
@riverpod
Future<List<VentaDiaSemana>> ventasPorDiaSemana(VentasPorDiaSemanaRef ref) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/pedidos/reporte/ventas-por-dia-semana');
  final List<dynamic> data = response.data;
  return data.map((json) => VentaDiaSemana.fromJson(json)).toList();
}

/// Provider para ventas por mes específico.
@riverpod
Future<List<VentaDiaMes>> ventasPorMes(
  VentasPorMesRef ref, {
  required int anio,
  required int mes,
}) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/pedidos/reporte/ventas-por-mes/$anio/$mes');
  final List<dynamic> data = response.data;
  return data.map((json) => VentaDiaMes.fromJson(json)).toList();
}

/// Provider para historial de ventas del repartidor.
@riverpod
Future<List<VentaRepartidorDia>> historialVentasRepartidor(
  HistorialVentasRepartidorRef ref,
  int repartidorId,
) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/pedidos/repartidor/total-por-dia/$repartidorId');
  final List<dynamic> data = response.data;
  return data.map((json) => VentaRepartidorDia.fromJson(json)).toList();
}
