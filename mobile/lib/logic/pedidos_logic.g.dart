// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pedidos_logic.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

String _$pedidosClienteControllerHash() =>
    r'35b4b2a82953c434036c5dac1151972dce3d5833';

/// Controlador de pedidos para el cliente.
///
/// Copied from [PedidosClienteController].
@ProviderFor(PedidosClienteController)
final pedidosClienteControllerProvider =
    AutoDisposeAsyncNotifierProvider<
      PedidosClienteController,
      List<Pedido>
    >.internal(
      PedidosClienteController.new,
      name: r'pedidosClienteControllerProvider',
      debugGetCreateSourceHash: const bool.fromEnvironment('dart.vm.product')
          ? null
          : _$pedidosClienteControllerHash,
      dependencies: null,
      allTransitiveDependencies: null,
    );

typedef _$PedidosClienteController = AutoDisposeAsyncNotifier<List<Pedido>>;
String _$pedidosAdminControllerHash() =>
    r'376a318263fedf274c75d2256949113e74c85502';

/// Controlador de pedidos para el admin.
///
/// Copied from [PedidosAdminController].
@ProviderFor(PedidosAdminController)
final pedidosAdminControllerProvider =
    AutoDisposeAsyncNotifierProvider<
      PedidosAdminController,
      List<Pedido>
    >.internal(
      PedidosAdminController.new,
      name: r'pedidosAdminControllerProvider',
      debugGetCreateSourceHash: const bool.fromEnvironment('dart.vm.product')
          ? null
          : _$pedidosAdminControllerHash,
      dependencies: null,
      allTransitiveDependencies: null,
    );

typedef _$PedidosAdminController = AutoDisposeAsyncNotifier<List<Pedido>>;
String _$pedidosRepartidorControllerHash() =>
    r'42c8e23e88a2391cd76bd2534dd36b1894b5f8a8';

/// Copied from Dart SDK
class _SystemHash {
  _SystemHash._();

  static int combine(int hash, int value) {
    // ignore: parameter_assignments
    hash = 0x1fffffff & (hash + value);
    // ignore: parameter_assignments
    hash = 0x1fffffff & (hash + ((0x0007ffff & hash) << 10));
    return hash ^ (hash >> 6);
  }

  static int finish(int hash) {
    // ignore: parameter_assignments
    hash = 0x1fffffff & (hash + ((0x03ffffff & hash) << 3));
    // ignore: parameter_assignments
    hash = hash ^ (hash >> 11);
    return 0x1fffffff & (hash + ((0x00003fff & hash) << 15));
  }
}

abstract class _$PedidosRepartidorController
    extends BuildlessAutoDisposeAsyncNotifier<List<Pedido>> {
  late final int repartidorId;

  FutureOr<List<Pedido>> build(int repartidorId);
}

/// Controlador de pedidos para el repartidor.
///
/// Copied from [PedidosRepartidorController].
@ProviderFor(PedidosRepartidorController)
const pedidosRepartidorControllerProvider = PedidosRepartidorControllerFamily();

/// Controlador de pedidos para el repartidor.
///
/// Copied from [PedidosRepartidorController].
class PedidosRepartidorControllerFamily
    extends Family<AsyncValue<List<Pedido>>> {
  /// Controlador de pedidos para el repartidor.
  ///
  /// Copied from [PedidosRepartidorController].
  const PedidosRepartidorControllerFamily();

  /// Controlador de pedidos para el repartidor.
  ///
  /// Copied from [PedidosRepartidorController].
  PedidosRepartidorControllerProvider call(int repartidorId) {
    return PedidosRepartidorControllerProvider(repartidorId);
  }

  @override
  PedidosRepartidorControllerProvider getProviderOverride(
    covariant PedidosRepartidorControllerProvider provider,
  ) {
    return call(provider.repartidorId);
  }

  static const Iterable<ProviderOrFamily>? _dependencies = null;

  @override
  Iterable<ProviderOrFamily>? get dependencies => _dependencies;

  static const Iterable<ProviderOrFamily>? _allTransitiveDependencies = null;

  @override
  Iterable<ProviderOrFamily>? get allTransitiveDependencies =>
      _allTransitiveDependencies;

  @override
  String? get name => r'pedidosRepartidorControllerProvider';
}

/// Controlador de pedidos para el repartidor.
///
/// Copied from [PedidosRepartidorController].
class PedidosRepartidorControllerProvider
    extends
        AutoDisposeAsyncNotifierProviderImpl<
          PedidosRepartidorController,
          List<Pedido>
        > {
  /// Controlador de pedidos para el repartidor.
  ///
  /// Copied from [PedidosRepartidorController].
  PedidosRepartidorControllerProvider(int repartidorId)
    : this._internal(
        () => PedidosRepartidorController()..repartidorId = repartidorId,
        from: pedidosRepartidorControllerProvider,
        name: r'pedidosRepartidorControllerProvider',
        debugGetCreateSourceHash: const bool.fromEnvironment('dart.vm.product')
            ? null
            : _$pedidosRepartidorControllerHash,
        dependencies: PedidosRepartidorControllerFamily._dependencies,
        allTransitiveDependencies:
            PedidosRepartidorControllerFamily._allTransitiveDependencies,
        repartidorId: repartidorId,
      );

  PedidosRepartidorControllerProvider._internal(
    super._createNotifier, {
    required super.name,
    required super.dependencies,
    required super.allTransitiveDependencies,
    required super.debugGetCreateSourceHash,
    required super.from,
    required this.repartidorId,
  }) : super.internal();

  final int repartidorId;

  @override
  FutureOr<List<Pedido>> runNotifierBuild(
    covariant PedidosRepartidorController notifier,
  ) {
    return notifier.build(repartidorId);
  }

  @override
  Override overrideWith(PedidosRepartidorController Function() create) {
    return ProviderOverride(
      origin: this,
      override: PedidosRepartidorControllerProvider._internal(
        () => create()..repartidorId = repartidorId,
        from: from,
        name: null,
        dependencies: null,
        allTransitiveDependencies: null,
        debugGetCreateSourceHash: null,
        repartidorId: repartidorId,
      ),
    );
  }

  @override
  AutoDisposeAsyncNotifierProviderElement<
    PedidosRepartidorController,
    List<Pedido>
  >
  createElement() {
    return _PedidosRepartidorControllerProviderElement(this);
  }

  @override
  bool operator ==(Object other) {
    return other is PedidosRepartidorControllerProvider &&
        other.repartidorId == repartidorId;
  }

  @override
  int get hashCode {
    var hash = _SystemHash.combine(0, runtimeType.hashCode);
    hash = _SystemHash.combine(hash, repartidorId.hashCode);

    return _SystemHash.finish(hash);
  }
}

@Deprecated('Will be removed in 3.0. Use Ref instead')
// ignore: unused_element
mixin PedidosRepartidorControllerRef
    on AutoDisposeAsyncNotifierProviderRef<List<Pedido>> {
  /// The parameter `repartidorId` of this provider.
  int get repartidorId;
}

class _PedidosRepartidorControllerProviderElement
    extends
        AutoDisposeAsyncNotifierProviderElement<
          PedidosRepartidorController,
          List<Pedido>
        >
    with PedidosRepartidorControllerRef {
  _PedidosRepartidorControllerProviderElement(super.provider);

  @override
  int get repartidorId =>
      (origin as PedidosRepartidorControllerProvider).repartidorId;
}

// ignore_for_file: type=lint
// ignore_for_file: subtype_of_sealed_class, invalid_use_of_internal_member, invalid_use_of_visible_for_testing_member, deprecated_member_use_from_same_package
