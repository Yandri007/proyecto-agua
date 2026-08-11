import 'package:freezed_annotation/freezed_annotation.dart';

part 'pedido_model.freezed.dart';
part 'pedido_model.g.dart';

/// Modelo de pedido.
@freezed
abstract class Pedido with _$Pedido {
  const factory Pedido({
    required int id,
    @JsonKey(name: 'cliente_id') required int clienteId,
    @JsonKey(name: 'cliente_nombre') String? clienteNombre,
    @JsonKey(name: 'repartidor_id') int? repartidorId,
    required double total,
    required String estado,
    @JsonKey(name: 'direccion_entrega') String? direccionEntrega,
    @JsonKey(name: 'latitud_entrega') double? latitudEntrega,
    @JsonKey(name: 'longitud_entrega') double? longitudEntrega,
    @Default(false) bool confirmado,
    @JsonKey(name: 'oculto_para_cliente') @Default(false) bool ocultoParaCliente,
    @JsonKey(name: 'created_at') String? createdAt,
    String? productos,
  }) = _Pedido;

  factory Pedido.fromJson(Map<String, dynamic> json) =>
      _$PedidoFromJson(json);
}

/// Item del detalle de pedido (para crear pedidos).
@freezed
abstract class PedidoItem with _$PedidoItem {
  const factory PedidoItem({
    @JsonKey(name: 'producto_id') required int productoId,
    required int cantidad,
  }) = _PedidoItem;

  factory PedidoItem.fromJson(Map<String, dynamic> json) =>
      _$PedidoItemFromJson(json);
}
