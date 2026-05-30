import 'package:freezed_annotation/freezed_annotation.dart';

part 'producto_model.freezed.dart';
part 'producto_model.g.dart';

/// Modelo de producto del catálogo.
@freezed
abstract class Producto with _$Producto {
  const factory Producto({
    required int id,
    required String nombre,
    required String tipo,
    required double precio,
    required int stock,
    @JsonKey(name: 'stock_minimo') required int stockMinimo,
  }) = _Producto;

  factory Producto.fromJson(Map<String, dynamic> json) =>
      _$ProductoFromJson(json);
}
