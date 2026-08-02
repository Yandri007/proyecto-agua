// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'producto_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Producto _$ProductoFromJson(Map<String, dynamic> json) => _Producto(
  id: (json['id'] as num).toInt(),
  nombre: json['nombre'] as String,
  tipo: json['tipo'] as String,
  precio: (json['precio'] as num).toDouble(),
  stock: (json['stock'] as num).toInt(),
  stockMinimo: (json['stock_minimo'] as num).toInt(),
);

Map<String, dynamic> _$ProductoToJson(_Producto instance) => <String, dynamic>{
  'id': instance.id,
  'nombre': instance.nombre,
  'tipo': instance.tipo,
  'precio': instance.precio,
  'stock': instance.stock,
  'stock_minimo': instance.stockMinimo,
};
