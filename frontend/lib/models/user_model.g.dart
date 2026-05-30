// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_User _$UserFromJson(Map<String, dynamic> json) => _User(
  id: (json['id'] as num).toInt(),
  nombre: json['nombre'] as String,
  email: json['email'] as String,
  rol: json['rol'] as String,
  telefono: json['telefono'] as String?,
  direccion: json['direccion'] as String?,
);

Map<String, dynamic> _$UserToJson(_User instance) => <String, dynamic>{
  'id': instance.id,
  'nombre': instance.nombre,
  'email': instance.email,
  'rol': instance.rol,
  'telefono': instance.telefono,
  'direccion': instance.direccion,
};
