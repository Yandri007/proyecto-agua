// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'pedido_model.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Pedido {

 int get id;@JsonKey(name: 'cliente_id') int get clienteId;@JsonKey(name: 'cliente_nombre') String? get clienteNombre;@JsonKey(name: 'repartidor_id') int? get repartidorId; double get total; String get estado;@JsonKey(name: 'direccion_entrega') String? get direccionEntrega;@JsonKey(name: 'latitud_entrega') double? get latitudEntrega;@JsonKey(name: 'longitud_entrega') double? get longitudEntrega; bool get confirmado;@JsonKey(name: 'oculto_para_cliente') bool get ocultoParaCliente;@JsonKey(name: 'created_at') String? get createdAt; String? get productos;
/// Create a copy of Pedido
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PedidoCopyWith<Pedido> get copyWith => _$PedidoCopyWithImpl<Pedido>(this as Pedido, _$identity);

  /// Serializes this Pedido to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Pedido&&(identical(other.id, id) || other.id == id)&&(identical(other.clienteId, clienteId) || other.clienteId == clienteId)&&(identical(other.clienteNombre, clienteNombre) || other.clienteNombre == clienteNombre)&&(identical(other.repartidorId, repartidorId) || other.repartidorId == repartidorId)&&(identical(other.total, total) || other.total == total)&&(identical(other.estado, estado) || other.estado == estado)&&(identical(other.direccionEntrega, direccionEntrega) || other.direccionEntrega == direccionEntrega)&&(identical(other.latitudEntrega, latitudEntrega) || other.latitudEntrega == latitudEntrega)&&(identical(other.longitudEntrega, longitudEntrega) || other.longitudEntrega == longitudEntrega)&&(identical(other.confirmado, confirmado) || other.confirmado == confirmado)&&(identical(other.ocultoParaCliente, ocultoParaCliente) || other.ocultoParaCliente == ocultoParaCliente)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&(identical(other.productos, productos) || other.productos == productos));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,clienteId,clienteNombre,repartidorId,total,estado,direccionEntrega,latitudEntrega,longitudEntrega,confirmado,ocultoParaCliente,createdAt,productos);

@override
String toString() {
  return 'Pedido(id: $id, clienteId: $clienteId, clienteNombre: $clienteNombre, repartidorId: $repartidorId, total: $total, estado: $estado, direccionEntrega: $direccionEntrega, latitudEntrega: $latitudEntrega, longitudEntrega: $longitudEntrega, confirmado: $confirmado, ocultoParaCliente: $ocultoParaCliente, createdAt: $createdAt, productos: $productos)';
}


}

/// @nodoc
abstract mixin class $PedidoCopyWith<$Res>  {
  factory $PedidoCopyWith(Pedido value, $Res Function(Pedido) _then) = _$PedidoCopyWithImpl;
@useResult
$Res call({
 int id,@JsonKey(name: 'cliente_id') int clienteId,@JsonKey(name: 'cliente_nombre') String? clienteNombre,@JsonKey(name: 'repartidor_id') int? repartidorId, double total, String estado,@JsonKey(name: 'direccion_entrega') String? direccionEntrega,@JsonKey(name: 'latitud_entrega') double? latitudEntrega,@JsonKey(name: 'longitud_entrega') double? longitudEntrega, bool confirmado,@JsonKey(name: 'oculto_para_cliente') bool ocultoParaCliente,@JsonKey(name: 'created_at') String? createdAt, String? productos
});




}
/// @nodoc
class _$PedidoCopyWithImpl<$Res>
    implements $PedidoCopyWith<$Res> {
  _$PedidoCopyWithImpl(this._self, this._then);

  final Pedido _self;
  final $Res Function(Pedido) _then;

/// Create a copy of Pedido
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? clienteId = null,Object? clienteNombre = freezed,Object? repartidorId = freezed,Object? total = null,Object? estado = null,Object? direccionEntrega = freezed,Object? latitudEntrega = freezed,Object? longitudEntrega = freezed,Object? confirmado = null,Object? ocultoParaCliente = null,Object? createdAt = freezed,Object? productos = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as int,clienteId: null == clienteId ? _self.clienteId : clienteId // ignore: cast_nullable_to_non_nullable
as int,clienteNombre: freezed == clienteNombre ? _self.clienteNombre : clienteNombre // ignore: cast_nullable_to_non_nullable
as String?,repartidorId: freezed == repartidorId ? _self.repartidorId : repartidorId // ignore: cast_nullable_to_non_nullable
as int?,total: null == total ? _self.total : total // ignore: cast_nullable_to_non_nullable
as double,estado: null == estado ? _self.estado : estado // ignore: cast_nullable_to_non_nullable
as String,direccionEntrega: freezed == direccionEntrega ? _self.direccionEntrega : direccionEntrega // ignore: cast_nullable_to_non_nullable
as String?,latitudEntrega: freezed == latitudEntrega ? _self.latitudEntrega : latitudEntrega // ignore: cast_nullable_to_non_nullable
as double?,longitudEntrega: freezed == longitudEntrega ? _self.longitudEntrega : longitudEntrega // ignore: cast_nullable_to_non_nullable
as double?,confirmado: null == confirmado ? _self.confirmado : confirmado // ignore: cast_nullable_to_non_nullable
as bool,ocultoParaCliente: null == ocultoParaCliente ? _self.ocultoParaCliente : ocultoParaCliente // ignore: cast_nullable_to_non_nullable
as bool,createdAt: freezed == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as String?,productos: freezed == productos ? _self.productos : productos // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [Pedido].
extension PedidoPatterns on Pedido {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Pedido value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Pedido() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Pedido value)  $default,){
final _that = this;
switch (_that) {
case _Pedido():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Pedido value)?  $default,){
final _that = this;
switch (_that) {
case _Pedido() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( int id, @JsonKey(name: 'cliente_id')  int clienteId, @JsonKey(name: 'cliente_nombre')  String? clienteNombre, @JsonKey(name: 'repartidor_id')  int? repartidorId,  double total,  String estado, @JsonKey(name: 'direccion_entrega')  String? direccionEntrega, @JsonKey(name: 'latitud_entrega')  double? latitudEntrega, @JsonKey(name: 'longitud_entrega')  double? longitudEntrega,  bool confirmado, @JsonKey(name: 'oculto_para_cliente')  bool ocultoParaCliente, @JsonKey(name: 'created_at')  String? createdAt,  String? productos)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Pedido() when $default != null:
return $default(_that.id,_that.clienteId,_that.clienteNombre,_that.repartidorId,_that.total,_that.estado,_that.direccionEntrega,_that.latitudEntrega,_that.longitudEntrega,_that.confirmado,_that.ocultoParaCliente,_that.createdAt,_that.productos);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( int id, @JsonKey(name: 'cliente_id')  int clienteId, @JsonKey(name: 'cliente_nombre')  String? clienteNombre, @JsonKey(name: 'repartidor_id')  int? repartidorId,  double total,  String estado, @JsonKey(name: 'direccion_entrega')  String? direccionEntrega, @JsonKey(name: 'latitud_entrega')  double? latitudEntrega, @JsonKey(name: 'longitud_entrega')  double? longitudEntrega,  bool confirmado, @JsonKey(name: 'oculto_para_cliente')  bool ocultoParaCliente, @JsonKey(name: 'created_at')  String? createdAt,  String? productos)  $default,) {final _that = this;
switch (_that) {
case _Pedido():
return $default(_that.id,_that.clienteId,_that.clienteNombre,_that.repartidorId,_that.total,_that.estado,_that.direccionEntrega,_that.latitudEntrega,_that.longitudEntrega,_that.confirmado,_that.ocultoParaCliente,_that.createdAt,_that.productos);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( int id, @JsonKey(name: 'cliente_id')  int clienteId, @JsonKey(name: 'cliente_nombre')  String? clienteNombre, @JsonKey(name: 'repartidor_id')  int? repartidorId,  double total,  String estado, @JsonKey(name: 'direccion_entrega')  String? direccionEntrega, @JsonKey(name: 'latitud_entrega')  double? latitudEntrega, @JsonKey(name: 'longitud_entrega')  double? longitudEntrega,  bool confirmado, @JsonKey(name: 'oculto_para_cliente')  bool ocultoParaCliente, @JsonKey(name: 'created_at')  String? createdAt,  String? productos)?  $default,) {final _that = this;
switch (_that) {
case _Pedido() when $default != null:
return $default(_that.id,_that.clienteId,_that.clienteNombre,_that.repartidorId,_that.total,_that.estado,_that.direccionEntrega,_that.latitudEntrega,_that.longitudEntrega,_that.confirmado,_that.ocultoParaCliente,_that.createdAt,_that.productos);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Pedido implements Pedido {
  const _Pedido({required this.id, @JsonKey(name: 'cliente_id') required this.clienteId, @JsonKey(name: 'cliente_nombre') this.clienteNombre, @JsonKey(name: 'repartidor_id') this.repartidorId, required this.total, required this.estado, @JsonKey(name: 'direccion_entrega') this.direccionEntrega, @JsonKey(name: 'latitud_entrega') this.latitudEntrega, @JsonKey(name: 'longitud_entrega') this.longitudEntrega, this.confirmado = false, @JsonKey(name: 'oculto_para_cliente') this.ocultoParaCliente = false, @JsonKey(name: 'created_at') this.createdAt, this.productos});
  factory _Pedido.fromJson(Map<String, dynamic> json) => _$PedidoFromJson(json);

@override final  int id;
@override@JsonKey(name: 'cliente_id') final  int clienteId;
@override@JsonKey(name: 'cliente_nombre') final  String? clienteNombre;
@override@JsonKey(name: 'repartidor_id') final  int? repartidorId;
@override final  double total;
@override final  String estado;
@override@JsonKey(name: 'direccion_entrega') final  String? direccionEntrega;
@override@JsonKey(name: 'latitud_entrega') final  double? latitudEntrega;
@override@JsonKey(name: 'longitud_entrega') final  double? longitudEntrega;
@override@JsonKey() final  bool confirmado;
@override@JsonKey(name: 'oculto_para_cliente') final  bool ocultoParaCliente;
@override@JsonKey(name: 'created_at') final  String? createdAt;
@override final  String? productos;

/// Create a copy of Pedido
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PedidoCopyWith<_Pedido> get copyWith => __$PedidoCopyWithImpl<_Pedido>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PedidoToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Pedido&&(identical(other.id, id) || other.id == id)&&(identical(other.clienteId, clienteId) || other.clienteId == clienteId)&&(identical(other.clienteNombre, clienteNombre) || other.clienteNombre == clienteNombre)&&(identical(other.repartidorId, repartidorId) || other.repartidorId == repartidorId)&&(identical(other.total, total) || other.total == total)&&(identical(other.estado, estado) || other.estado == estado)&&(identical(other.direccionEntrega, direccionEntrega) || other.direccionEntrega == direccionEntrega)&&(identical(other.latitudEntrega, latitudEntrega) || other.latitudEntrega == latitudEntrega)&&(identical(other.longitudEntrega, longitudEntrega) || other.longitudEntrega == longitudEntrega)&&(identical(other.confirmado, confirmado) || other.confirmado == confirmado)&&(identical(other.ocultoParaCliente, ocultoParaCliente) || other.ocultoParaCliente == ocultoParaCliente)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&(identical(other.productos, productos) || other.productos == productos));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,clienteId,clienteNombre,repartidorId,total,estado,direccionEntrega,latitudEntrega,longitudEntrega,confirmado,ocultoParaCliente,createdAt,productos);

@override
String toString() {
  return 'Pedido(id: $id, clienteId: $clienteId, clienteNombre: $clienteNombre, repartidorId: $repartidorId, total: $total, estado: $estado, direccionEntrega: $direccionEntrega, latitudEntrega: $latitudEntrega, longitudEntrega: $longitudEntrega, confirmado: $confirmado, ocultoParaCliente: $ocultoParaCliente, createdAt: $createdAt, productos: $productos)';
}


}

/// @nodoc
abstract mixin class _$PedidoCopyWith<$Res> implements $PedidoCopyWith<$Res> {
  factory _$PedidoCopyWith(_Pedido value, $Res Function(_Pedido) _then) = __$PedidoCopyWithImpl;
@override @useResult
$Res call({
 int id,@JsonKey(name: 'cliente_id') int clienteId,@JsonKey(name: 'cliente_nombre') String? clienteNombre,@JsonKey(name: 'repartidor_id') int? repartidorId, double total, String estado,@JsonKey(name: 'direccion_entrega') String? direccionEntrega,@JsonKey(name: 'latitud_entrega') double? latitudEntrega,@JsonKey(name: 'longitud_entrega') double? longitudEntrega, bool confirmado,@JsonKey(name: 'oculto_para_cliente') bool ocultoParaCliente,@JsonKey(name: 'created_at') String? createdAt, String? productos
});




}
/// @nodoc
class __$PedidoCopyWithImpl<$Res>
    implements _$PedidoCopyWith<$Res> {
  __$PedidoCopyWithImpl(this._self, this._then);

  final _Pedido _self;
  final $Res Function(_Pedido) _then;

/// Create a copy of Pedido
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? clienteId = null,Object? clienteNombre = freezed,Object? repartidorId = freezed,Object? total = null,Object? estado = null,Object? direccionEntrega = freezed,Object? latitudEntrega = freezed,Object? longitudEntrega = freezed,Object? confirmado = null,Object? ocultoParaCliente = null,Object? createdAt = freezed,Object? productos = freezed,}) {
  return _then(_Pedido(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as int,clienteId: null == clienteId ? _self.clienteId : clienteId // ignore: cast_nullable_to_non_nullable
as int,clienteNombre: freezed == clienteNombre ? _self.clienteNombre : clienteNombre // ignore: cast_nullable_to_non_nullable
as String?,repartidorId: freezed == repartidorId ? _self.repartidorId : repartidorId // ignore: cast_nullable_to_non_nullable
as int?,total: null == total ? _self.total : total // ignore: cast_nullable_to_non_nullable
as double,estado: null == estado ? _self.estado : estado // ignore: cast_nullable_to_non_nullable
as String,direccionEntrega: freezed == direccionEntrega ? _self.direccionEntrega : direccionEntrega // ignore: cast_nullable_to_non_nullable
as String?,latitudEntrega: freezed == latitudEntrega ? _self.latitudEntrega : latitudEntrega // ignore: cast_nullable_to_non_nullable
as double?,longitudEntrega: freezed == longitudEntrega ? _self.longitudEntrega : longitudEntrega // ignore: cast_nullable_to_non_nullable
as double?,confirmado: null == confirmado ? _self.confirmado : confirmado // ignore: cast_nullable_to_non_nullable
as bool,ocultoParaCliente: null == ocultoParaCliente ? _self.ocultoParaCliente : ocultoParaCliente // ignore: cast_nullable_to_non_nullable
as bool,createdAt: freezed == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as String?,productos: freezed == productos ? _self.productos : productos // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$PedidoItem {

@JsonKey(name: 'producto_id') int get productoId; int get cantidad;
/// Create a copy of PedidoItem
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PedidoItemCopyWith<PedidoItem> get copyWith => _$PedidoItemCopyWithImpl<PedidoItem>(this as PedidoItem, _$identity);

  /// Serializes this PedidoItem to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PedidoItem&&(identical(other.productoId, productoId) || other.productoId == productoId)&&(identical(other.cantidad, cantidad) || other.cantidad == cantidad));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,productoId,cantidad);

@override
String toString() {
  return 'PedidoItem(productoId: $productoId, cantidad: $cantidad)';
}


}

/// @nodoc
abstract mixin class $PedidoItemCopyWith<$Res>  {
  factory $PedidoItemCopyWith(PedidoItem value, $Res Function(PedidoItem) _then) = _$PedidoItemCopyWithImpl;
@useResult
$Res call({
@JsonKey(name: 'producto_id') int productoId, int cantidad
});




}
/// @nodoc
class _$PedidoItemCopyWithImpl<$Res>
    implements $PedidoItemCopyWith<$Res> {
  _$PedidoItemCopyWithImpl(this._self, this._then);

  final PedidoItem _self;
  final $Res Function(PedidoItem) _then;

/// Create a copy of PedidoItem
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? productoId = null,Object? cantidad = null,}) {
  return _then(_self.copyWith(
productoId: null == productoId ? _self.productoId : productoId // ignore: cast_nullable_to_non_nullable
as int,cantidad: null == cantidad ? _self.cantidad : cantidad // ignore: cast_nullable_to_non_nullable
as int,
  ));
}

}


/// Adds pattern-matching-related methods to [PedidoItem].
extension PedidoItemPatterns on PedidoItem {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PedidoItem value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PedidoItem() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PedidoItem value)  $default,){
final _that = this;
switch (_that) {
case _PedidoItem():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PedidoItem value)?  $default,){
final _that = this;
switch (_that) {
case _PedidoItem() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function(@JsonKey(name: 'producto_id')  int productoId,  int cantidad)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PedidoItem() when $default != null:
return $default(_that.productoId,_that.cantidad);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function(@JsonKey(name: 'producto_id')  int productoId,  int cantidad)  $default,) {final _that = this;
switch (_that) {
case _PedidoItem():
return $default(_that.productoId,_that.cantidad);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function(@JsonKey(name: 'producto_id')  int productoId,  int cantidad)?  $default,) {final _that = this;
switch (_that) {
case _PedidoItem() when $default != null:
return $default(_that.productoId,_that.cantidad);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PedidoItem implements PedidoItem {
  const _PedidoItem({@JsonKey(name: 'producto_id') required this.productoId, required this.cantidad});
  factory _PedidoItem.fromJson(Map<String, dynamic> json) => _$PedidoItemFromJson(json);

@override@JsonKey(name: 'producto_id') final  int productoId;
@override final  int cantidad;

/// Create a copy of PedidoItem
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PedidoItemCopyWith<_PedidoItem> get copyWith => __$PedidoItemCopyWithImpl<_PedidoItem>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PedidoItemToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PedidoItem&&(identical(other.productoId, productoId) || other.productoId == productoId)&&(identical(other.cantidad, cantidad) || other.cantidad == cantidad));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,productoId,cantidad);

@override
String toString() {
  return 'PedidoItem(productoId: $productoId, cantidad: $cantidad)';
}


}

/// @nodoc
abstract mixin class _$PedidoItemCopyWith<$Res> implements $PedidoItemCopyWith<$Res> {
  factory _$PedidoItemCopyWith(_PedidoItem value, $Res Function(_PedidoItem) _then) = __$PedidoItemCopyWithImpl;
@override @useResult
$Res call({
@JsonKey(name: 'producto_id') int productoId, int cantidad
});




}
/// @nodoc
class __$PedidoItemCopyWithImpl<$Res>
    implements _$PedidoItemCopyWith<$Res> {
  __$PedidoItemCopyWithImpl(this._self, this._then);

  final _PedidoItem _self;
  final $Res Function(_PedidoItem) _then;

/// Create a copy of PedidoItem
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? productoId = null,Object? cantidad = null,}) {
  return _then(_PedidoItem(
productoId: null == productoId ? _self.productoId : productoId // ignore: cast_nullable_to_non_nullable
as int,cantidad: null == cantidad ? _self.cantidad : cantidad // ignore: cast_nullable_to_non_nullable
as int,
  ));
}


}

// dart format on
