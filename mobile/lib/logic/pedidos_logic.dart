import 'dart:async';

import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../models/pedido_model.dart';
import 'api_service.dart';

part 'pedidos_logic.g.dart';

/// Controlador de pedidos para el cliente.
@riverpod
class PedidosClienteController extends _$PedidosClienteController {
  @override
  FutureOr<List<Pedido>> build() async {
    return _fetchMisPedidos();
  }

  Future<List<Pedido>> _fetchMisPedidos() async {
    final api = ref.read(apiServiceProvider);
    final response = await api.get('/pedidos/mis-pedidos');
    final List<dynamic> data = response.data;
    return data.map((json) => Pedido.fromJson(json)).toList();
  }

  /// Refrescar pedidos del cliente.
  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchMisPedidos());
  }

  /// Crear un nuevo pedido.
  Future<Pedido> crearPedido({
    required List<PedidoItem> productos,
    required String direccionEntrega,
    double? latitud,
    double? longitud,
  }) async {
    final api = ref.read(apiServiceProvider);
    final response = await api.post('/pedidos', data: {
      'productos': productos.map((p) => p.toJson()).toList(),
      'direccion_entrega': direccionEntrega,
      'latitud_entrega': latitud ?? -0.180653,
      'longitud_entrega': longitud ?? -78.467838,
    });
    await refresh();
    return Pedido.fromJson(response.data);
  }

  /// Cancelar un pedido.
  Future<void> cancelarPedido(int pedidoId) async {
    final api = ref.read(apiServiceProvider);
    await api.put('/pedidos/$pedidoId/estado', data: {'estado': 'cancelado'});
    await refresh();
  }

  /// Confirmar recepción de un pedido.
  Future<void> confirmarRecepcion(int pedidoId) async {
    final api = ref.read(apiServiceProvider);
    await api.put('/pedidos/$pedidoId/confirmar', data: {'confirmado': true});
    await refresh();
  }

  /// Ocultar un pedido del historial.
  Future<void> ocultarPedido(int pedidoId) async {
    final api = ref.read(apiServiceProvider);
    await api.put('/pedidos/cliente/ocultar/$pedidoId');
    await refresh();
  }

  /// Vaciar todo el historial del cliente.
  Future<void> vaciarHistorial() async {
    final api = ref.read(apiServiceProvider);
    await api.put('/pedidos/cliente/vaciar-historial');
    await refresh();
  }
}

/// Controlador de pedidos para el admin.
@riverpod
class PedidosAdminController extends _$PedidosAdminController {
  @override
  FutureOr<List<Pedido>> build() async {
    return _fetchTodosPedidos();
  }

  Future<List<Pedido>> _fetchTodosPedidos() async {
    final api = ref.read(apiServiceProvider);
    final response = await api.get('/pedidos/admin/todos');
    final List<dynamic> data = response.data;
    return data.map((json) => Pedido.fromJson(json)).toList();
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchTodosPedidos());
  }

  /// Asignar repartidor a un pedido.
  Future<void> asignarRepartidor(int pedidoId, int repartidorId) async {
    final api = ref.read(apiServiceProvider);
    await api.put('/pedidos/$pedidoId/asignar', data: {
      'repartidor_id': repartidorId,
    });
    await api.put('/pedidos/$pedidoId/estado', data: {
      'estado': 'en_camino',
    });
    await refresh();
  }

  /// Cambiar estado de un pedido.
  Future<void> cambiarEstado(int pedidoId, String estado) async {
    final api = ref.read(apiServiceProvider);
    await api.put('/pedidos/$pedidoId/estado', data: {'estado': estado});
    await refresh();
  }
}

/// Controlador de pedidos para el repartidor.
@riverpod
class PedidosRepartidorController extends _$PedidosRepartidorController {
  late int _repartidorId;

  @override
  FutureOr<List<Pedido>> build(int repartidorId) async {
    _repartidorId = repartidorId;
    return _fetchPedidosRepartidor(repartidorId);
  }

  Future<List<Pedido>> _fetchPedidosRepartidor(int id) async {
    final api = ref.read(apiServiceProvider);
    final response = await api.get('/pedidos/repartidor/$id');
    final List<dynamic> data = response.data;
    return data.map((json) => Pedido.fromJson(json)).toList();
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(
        () => _fetchPedidosRepartidor(_repartidorId));
  }

  /// Marcar pedido como entregado.
  Future<void> entregarPedido(int pedidoId) async {
    final api = ref.read(apiServiceProvider);
    await api.put('/pedidos/$pedidoId/estado', data: {'estado': 'entregado'});
    await refresh();
  }
}
