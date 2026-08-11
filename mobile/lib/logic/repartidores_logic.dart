import 'dart:async';

import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../models/user_model.dart';
import 'api_service.dart';

part 'repartidores_logic.g.dart';

/// Controlador para la gestión de repartidores (admin).
@riverpod
class RepartidoresController extends _$RepartidoresController {
  @override
  FutureOr<List<User>> build() async {
    return _fetchRepartidores();
  }

  Future<List<User>> _fetchRepartidores() async {
    final api = ref.read(apiServiceProvider);
    final response = await api.get('/auth/repartidores');
    final List<dynamic> data = response.data;
    return data.map((json) => User.fromJson(json)).toList();
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchRepartidores());
  }

  /// Registrar nuevo repartidor.
  Future<void> registrar({
    required String nombre,
    required String email,
    required String password,
    String? telefono,
  }) async {
    final api = ref.read(apiServiceProvider);
    await api.post('/auth/register', data: {
      'nombre': nombre,
      'email': email,
      'password': password,
      'telefono': telefono,
      'rol': 'repartidor',
    });
    await refresh();
  }

  /// Eliminar repartidor.
  Future<void> eliminar(int id) async {
    final api = ref.read(apiServiceProvider);
    await api.delete('/auth/repartidor/$id');
    await refresh();
  }
}
