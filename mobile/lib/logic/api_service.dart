import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:shared_preferences/shared_preferences.dart';

part 'api_service.g.dart';

/// Servicio base para llamadas HTTP al backend.
/// Centraliza la configuración de Dio, interceptores y el token JWT.
class ApiService {
  final Dio _dio;

  ApiService({required String baseUrl, String? token})
      : _dio = Dio(
          BaseOptions(
            baseUrl: baseUrl,
            connectTimeout: const Duration(seconds: 10),
            receiveTimeout: const Duration(seconds: 10),
            headers: {
              'Content-Type': 'application/json',
              if (token != null) 'Authorization': 'Bearer $token',
            },
          ),
        );

  /// Actualiza el token en los headers después del login.
  void setToken(String token) {
    _dio.options.headers['Authorization'] = 'Bearer $token';
  }

  /// Limpia el token (logout).
  void clearToken() {
    _dio.options.headers.remove('Authorization');
  }

  // === GET ===
  Future<Response> get(String path, {Map<String, dynamic>? queryParameters}) {
    return _dio.get(path, queryParameters: queryParameters);
  }

  // === POST ===
  Future<Response> post(String path, {dynamic data}) {
    return _dio.post(path, data: data);
  }

  // === PUT ===
  Future<Response> put(String path, {dynamic data}) {
    return _dio.put(path, data: data);
  }

  // === DELETE ===
  Future<Response> delete(String path) {
    return _dio.delete(path);
  }
}

/// URL base del backend. Cambia esto según tu entorno.
const String kApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3000/api',
);

/// Provider del servicio API.
@Riverpod(keepAlive: true)
ApiService apiService(ApiServiceRef ref) {
  return ApiService(baseUrl: kApiBaseUrl);
}

/// Provider de SharedPreferences.
@Riverpod(keepAlive: true)
Future<SharedPreferences> sharedPreferences(SharedPreferencesRef ref) {
  return SharedPreferences.getInstance();
}
