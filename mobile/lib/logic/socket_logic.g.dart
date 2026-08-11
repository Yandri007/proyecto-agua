// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'socket_logic.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

String _$socketControllerHash() => r'de9d0358951bcab143b83229724d52972b26fe29';

/// Controlador de WebSocket para notificaciones en tiempo real.
/// Usa Socket.IO para compatibilidad con el backend Node.js.
///
/// Copied from [SocketController].
@ProviderFor(SocketController)
final socketControllerProvider =
    NotifierProvider<SocketController, io.Socket?>.internal(
      SocketController.new,
      name: r'socketControllerProvider',
      debugGetCreateSourceHash: const bool.fromEnvironment('dart.vm.product')
          ? null
          : _$socketControllerHash,
      dependencies: null,
      allTransitiveDependencies: null,
    );

typedef _$SocketController = Notifier<io.Socket?>;
// ignore_for_file: type=lint
// ignore_for_file: subtype_of_sealed_class, invalid_use_of_internal_member, invalid_use_of_visible_for_testing_member, deprecated_member_use_from_same_package
