import 'dart:async';

import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/auth_response_model.dart';
import '../models/user_model.dart';
import 'api_service.dart';

part 'auth_logic.g.dart';

/// Controlador de autenticación.
/// Maneja login, registro, logout y persistencia del token JWT.
@Riverpod(keepAlive: true)
class AuthController extends _$AuthController {
  static const _tokenKey = 'auth_token';
  static const _userIdKey = 'user_id';
  static const _userNameKey = 'user_name';
  static const _userEmailKey = 'user_email';
  static const _userRolKey = 'user_rol';

  @override
  FutureOr<User?> build() async {
    // Intentar restaurar sesión desde SharedPreferences
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_tokenKey);
    final userId = prefs.getInt(_userIdKey);
    final userName = prefs.getString(_userNameKey);
    final userEmail = prefs.getString(_userEmailKey);
    final userRol = prefs.getString(_userRolKey);

    if (token != null && userId != null && userName != null && userEmail != null && userRol != null) {
      // Restaurar el token en ApiService
      ref.read(apiServiceProvider).setToken(token);
      return User(
        id: userId,
        nombre: userName,
        email: userEmail,
        rol: userRol,
      );
    }
    return null;
  }

  /// Login con email y password.
  Future<User> login(String email, String password) async {
    state = const AsyncValue.loading();
    try {
      final api = ref.read(apiServiceProvider);
      final response = await api.post('/auth/login', data: {
        'email': email,
        'password': password,
      });

      final authResponse = AuthResponse.fromJson(response.data);
      api.setToken(authResponse.token);

      // Persistir sesión
      await _saveSession(authResponse);

      state = AsyncValue.data(authResponse.user);
      return authResponse.user;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      rethrow;
    }
  }

  /// Registro de nuevo usuario.
  Future<User> register({
    required String nombre,
    required String email,
    required String password,
    String? telefono,
    String rol = 'cliente',
  }) async {
    state = const AsyncValue.loading();
    try {
      final api = ref.read(apiServiceProvider);
      final response = await api.post('/auth/register', data: {
        'nombre': nombre,
        'email': email,
        'password': password,
        'telefono': telefono,
        'rol': rol,
      });

      final authResponse = AuthResponse.fromJson(response.data);
      api.setToken(authResponse.token);

      await _saveSession(authResponse);

      state = AsyncValue.data(authResponse.user);
      return authResponse.user;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      rethrow;
    }
  }

  /// Logout: limpia token y estado.
  Future<void> logout() async {
    final api = ref.read(apiServiceProvider);
    api.clearToken();

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_userIdKey);
    await prefs.remove(_userNameKey);
    await prefs.remove(_userEmailKey);
    await prefs.remove(_userRolKey);

    state = const AsyncValue.data(null);
  }

  /// Obtener el token actual.
  Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

  Future<void> _saveSession(AuthResponse authResponse) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, authResponse.token);
    await prefs.setInt(_userIdKey, authResponse.user.id);
    await prefs.setString(_userNameKey, authResponse.user.nombre);
    await prefs.setString(_userEmailKey, authResponse.user.email);
    await prefs.setString(_userRolKey, authResponse.user.rol);
  }
}
