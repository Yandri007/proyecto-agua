// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pedido_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Pedido _$PedidoFromJson(Map<String, dynamic> json) => _Pedido(
  id: (json['id'] as num).toInt(),
  clienteId: (json['cliente_id'] as num).toInt(),
  clienteNombre: json['cliente_nombre'] as String?,
  repartidorId: (json['repartidor_id'] as num?)?.toInt(),
  total: (json['total'] as num).toDouble(),
  estado: json['estado'] as String,
  direccionEntrega: json['direccion_entrega'] as String?,
  latitudEntrega: (json['latitud_entrega'] as num?)?.toDouble(),
  longitudEntrega: (json['longitud_entrega'] as num?)?.toDouble(),
  confirmado: json['confirmado'] as bool? ?? false,
  ocultoParaCliente: json['oculto_para_cliente'] as bool? ?? false,
  createdAt: json['created_at'] as String?,
  productos: json['productos'] as String?,
);

Map<String, dynamic> _$PedidoToJson(_Pedido instance) => <String, dynamic>{
  'id': instance.id,
  'cliente_id': instance.clienteId,
  'cliente_nombre': instance.clienteNombre,
  'repartidor_id': instance.repartidorId,
  'total': instance.total,
  'estado': instance.estado,
  'direccion_entrega': instance.direccionEntrega,
  'latitud_entrega': instance.latitudEntrega,
  'longitud_entrega': instance.longitudEntrega,
  'confirmado': instance.confirmado,
  'oculto_para_cliente': instance.ocultoParaCliente,
  'created_at': instance.createdAt,
  'productos': instance.productos,
};

_PedidoItem _$PedidoItemFromJson(Map<String, dynamic> json) => _PedidoItem(
  productoId: (json['producto_id'] as num).toInt(),
  cantidad: (json['cantidad'] as num).toInt(),
);

Map<String, dynamic> _$PedidoItemToJson(_PedidoItem instance) =>
    <String, dynamic>{
      'producto_id': instance.productoId,
      'cantidad': instance.cantidad,
    };
