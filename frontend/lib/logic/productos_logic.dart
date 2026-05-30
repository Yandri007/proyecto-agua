import 'dart:async';

import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../models/producto_model.dart';
import 'api_service.dart';

part 'productos_logic.g.dart';

/// Controlador para la gestión de productos.
@riverpod
class ProductosController extends _$ProductosController {
  @override
  FutureOr<List<Producto>> build() async {
    return _fetchProductos();
  }

  Future<List<Producto>> _fetchProductos() async {
    final api = ref.read(apiServiceProvider);
    final response = await api.get('/productos');
    final List<dynamic> data = response.data;
    return data.map((json) => Producto.fromJson(json)).toList();
  }

  /// Refrescar lista de productos.
  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchProductos());
  }

  /// Crear un nuevo producto (admin).
  Future<void> crear({
    required String nombre,
    required String tipo,
    required double precio,
    required int stock,
    required int stockMinimo,
  }) async {
    final api = ref.read(apiServiceProvider);
    await api.post('/productos', data: {
      'nombre': nombre,
      'tipo': tipo,
      'precio': precio,
      'stock': stock,
      'stock_minimo': stockMinimo,
    });
    await refresh();
  }

  /// Editar un producto existente (admin).
  Future<void> editar({
    required int id,
    required String nombre,
    required String tipo,
    required double precio,
    required int stock,
    required int stockMinimo,
  }) async {
    final api = ref.read(apiServiceProvider);
    await api.put('/productos/$id', data: {
      'nombre': nombre,
      'tipo': tipo,
      'precio': precio,
      'stock': stock,
      'stock_minimo': stockMinimo,
    });
    await refresh();
  }

  /// Eliminar un producto (admin).
  Future<void> eliminar(int id) async {
    final api = ref.read(apiServiceProvider);
    await api.delete('/productos/$id');
    await refresh();
  }
}
