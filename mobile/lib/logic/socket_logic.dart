import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

part 'socket_logic.g.dart';

/// URL base del servidor WebSocket (mismo que el backend).
const String kSocketUrl = String.fromEnvironment(
  'SOCKET_URL',
  defaultValue: 'http://localhost:3000',
);

/// Controlador de WebSocket para notificaciones en tiempo real.
/// Usa Socket.IO para compatibilidad con el backend Node.js.
@Riverpod(keepAlive: true)
class SocketController extends _$SocketController {
  io.Socket? _socket;

  @override
  io.Socket? build() {
    ref.onDispose(() {
      _socket?.dispose();
    });
    return null;
  }

  /// Conectar y registrar el usuario actual.
  void connect({required String userId, required String rol}) {
    _socket = io.io(
      kSocketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .build(),
    );

    _socket!.connect();

    _socket!.onConnect((_) {
      _socket!.emit('registrar_usuario', {'userId': userId, 'rol': rol});
    });

    state = _socket;
  }

  /// Emitir un evento al servidor.
  void emit(String event, dynamic data) {
    _socket?.emit(event, data);
  }

  /// Escuchar un evento del servidor.
  void on(String event, Function(dynamic) callback) {
    _socket?.on(event, callback);
  }

  /// Desconectar.
  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    state = null;
  }

  /// ¿Está conectado?
  bool get isConnected => _socket?.connected ?? false;
}
