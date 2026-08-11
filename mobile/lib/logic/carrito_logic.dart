import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../models/producto_model.dart';

part 'carrito_logic.g.dart';

/// Item del carrito con producto y cantidad.
class CarritoItem {
  final Producto producto;
  final int cantidad;

  const CarritoItem({required this.producto, this.cantidad = 1});

  double get subtotal => producto.precio * cantidad;

  CarritoItem copyWith({int? cantidad}) {
    return CarritoItem(
      producto: producto,
      cantidad: cantidad ?? this.cantidad,
    );
  }
}

/// Controlador del carrito de compras (cliente).
@riverpod
class CarritoController extends _$CarritoController {
  @override
  List<CarritoItem> build() {
    return [];
  }

  /// Agregar un producto al carrito.
  void agregar(Producto producto) {
    final index = state.indexWhere((item) => item.producto.id == producto.id);
    if (index >= 0) {
      // Ya existe, incrementar cantidad
      final updated = [...state];
      updated[index] = updated[index].copyWith(
        cantidad: updated[index].cantidad + 1,
      );
      state = updated;
    } else {
      state = [...state, CarritoItem(producto: producto)];
    }
  }

  /// Remover un item del carrito por índice.
  void remover(int index) {
    final updated = [...state];
    updated.removeAt(index);
    state = updated;
  }

  /// Remover un producto específico.
  void removerProducto(int productoId) {
    state = state.where((item) => item.producto.id != productoId).toList();
  }

  /// Actualizar cantidad de un item.
  void actualizarCantidad(int productoId, int cantidad) {
    if (cantidad <= 0) {
      removerProducto(productoId);
      return;
    }
    state = state.map((item) {
      if (item.producto.id == productoId) {
        return item.copyWith(cantidad: cantidad);
      }
      return item;
    }).toList();
  }

  /// Vaciar el carrito.
  void vaciar() {
    state = [];
  }

  /// Calcular el total del carrito.
  double get total => state.fold(0.0, (sum, item) => sum + item.subtotal);

  /// Número total de items.
  int get cantidadTotal => state.fold(0, (sum, item) => sum + item.cantidad);
}
