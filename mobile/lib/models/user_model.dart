import 'package:freezed_annotation/freezed_annotation.dart';

part 'user_model.freezed.dart';
part 'user_model.g.dart';

/// Modelo de usuario del sistema.
/// Roles: 'admin', 'cliente', 'repartidor'.
@freezed
abstract class User with _$User {
  const factory User({
    required int id,
    required String nombre,
    required String email,
    required String rol,
    String? telefono,
    String? direccion,
  }) = _User;

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
}
