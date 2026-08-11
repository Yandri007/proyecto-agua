// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reportes_logic.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

String _$ventasPorDiaSemanaHash() =>
    r'fed875dd14c76175cb61500fa50688ccb5de1fbf';

/// Provider para ventas por día de la semana.
///
/// Copied from [ventasPorDiaSemana].
@ProviderFor(ventasPorDiaSemana)
final ventasPorDiaSemanaProvider =
    AutoDisposeFutureProvider<List<VentaDiaSemana>>.internal(
      ventasPorDiaSemana,
      name: r'ventasPorDiaSemanaProvider',
      debugGetCreateSourceHash: const bool.fromEnvironment('dart.vm.product')
          ? null
          : _$ventasPorDiaSemanaHash,
      dependencies: null,
      allTransitiveDependencies: null,
    );

@Deprecated('Will be removed in 3.0. Use Ref instead')
// ignore: unused_element
typedef VentasPorDiaSemanaRef =
    AutoDisposeFutureProviderRef<List<VentaDiaSemana>>;
String _$ventasPorMesHash() => r'2e29fcc3499f08ade01fb50690e3301b5303d408';

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

/// Provider para ventas por mes específico.
///
/// Copied from [ventasPorMes].
@ProviderFor(ventasPorMes)
const ventasPorMesProvider = VentasPorMesFamily();

/// Provider para ventas por mes específico.
///
/// Copied from [ventasPorMes].
class VentasPorMesFamily extends Family<AsyncValue<List<VentaDiaMes>>> {
  /// Provider para ventas por mes específico.
  ///
  /// Copied from [ventasPorMes].
  const VentasPorMesFamily();

  /// Provider para ventas por mes específico.
  ///
  /// Copied from [ventasPorMes].
  VentasPorMesProvider call({required int anio, required int mes}) {
    return VentasPorMesProvider(anio: anio, mes: mes);
  }

  @override
  VentasPorMesProvider getProviderOverride(
    covariant VentasPorMesProvider provider,
  ) {
    return call(anio: provider.anio, mes: provider.mes);
  }

  static const Iterable<ProviderOrFamily>? _dependencies = null;

  @override
  Iterable<ProviderOrFamily>? get dependencies => _dependencies;

  static const Iterable<ProviderOrFamily>? _allTransitiveDependencies = null;

  @override
  Iterable<ProviderOrFamily>? get allTransitiveDependencies =>
      _allTransitiveDependencies;

  @override
  String? get name => r'ventasPorMesProvider';
}

/// Provider para ventas por mes específico.
///
/// Copied from [ventasPorMes].
class VentasPorMesProvider
    extends AutoDisposeFutureProvider<List<VentaDiaMes>> {
  /// Provider para ventas por mes específico.
  ///
  /// Copied from [ventasPorMes].
  VentasPorMesProvider({required int anio, required int mes})
    : this._internal(
        (ref) => ventasPorMes(ref as VentasPorMesRef, anio: anio, mes: mes),
        from: ventasPorMesProvider,
        name: r'ventasPorMesProvider',
        debugGetCreateSourceHash: const bool.fromEnvironment('dart.vm.product')
            ? null
            : _$ventasPorMesHash,
        dependencies: VentasPorMesFamily._dependencies,
        allTransitiveDependencies:
            VentasPorMesFamily._allTransitiveDependencies,
        anio: anio,
        mes: mes,
      );

  VentasPorMesProvider._internal(
    super._createNotifier, {
    required super.name,
    required super.dependencies,
    required super.allTransitiveDependencies,
    required super.debugGetCreateSourceHash,
    required super.from,
    required this.anio,
    required this.mes,
  }) : super.internal();

  final int anio;
  final int mes;

  @override
  Override overrideWith(
    FutureOr<List<VentaDiaMes>> Function(VentasPorMesRef provider) create,
  ) {
    return ProviderOverride(
      origin: this,
      override: VentasPorMesProvider._internal(
        (ref) => create(ref as VentasPorMesRef),
        from: from,
        name: null,
        dependencies: null,
        allTransitiveDependencies: null,
        debugGetCreateSourceHash: null,
        anio: anio,
        mes: mes,
      ),
    );
  }

  @override
  AutoDisposeFutureProviderElement<List<VentaDiaMes>> createElement() {
    return _VentasPorMesProviderElement(this);
  }

  @override
  bool operator ==(Object other) {
    return other is VentasPorMesProvider &&
        other.anio == anio &&
        other.mes == mes;
  }

  @override
  int get hashCode {
    var hash = _SystemHash.combine(0, runtimeType.hashCode);
    hash = _SystemHash.combine(hash, anio.hashCode);
    hash = _SystemHash.combine(hash, mes.hashCode);

    return _SystemHash.finish(hash);
  }
}

@Deprecated('Will be removed in 3.0. Use Ref instead')
// ignore: unused_element
mixin VentasPorMesRef on AutoDisposeFutureProviderRef<List<VentaDiaMes>> {
  /// The parameter `anio` of this provider.
  int get anio;

  /// The parameter `mes` of this provider.
  int get mes;
}

class _VentasPorMesProviderElement
    extends AutoDisposeFutureProviderElement<List<VentaDiaMes>>
    with VentasPorMesRef {
  _VentasPorMesProviderElement(super.provider);

  @override
  int get anio => (origin as VentasPorMesProvider).anio;
  @override
  int get mes => (origin as VentasPorMesProvider).mes;
}

String _$historialVentasRepartidorHash() =>
    r'05e840949aa8605c80c822d9fd791d49d9c085ed';

/// Provider para historial de ventas del repartidor.
///
/// Copied from [historialVentasRepartidor].
@ProviderFor(historialVentasRepartidor)
const historialVentasRepartidorProvider = HistorialVentasRepartidorFamily();

/// Provider para historial de ventas del repartidor.
///
/// Copied from [historialVentasRepartidor].
class HistorialVentasRepartidorFamily
    extends Family<AsyncValue<List<VentaRepartidorDia>>> {
  /// Provider para historial de ventas del repartidor.
  ///
  /// Copied from [historialVentasRepartidor].
  const HistorialVentasRepartidorFamily();

  /// Provider para historial de ventas del repartidor.
  ///
  /// Copied from [historialVentasRepartidor].
  HistorialVentasRepartidorProvider call(int repartidorId) {
    return HistorialVentasRepartidorProvider(repartidorId);
  }

  @override
  HistorialVentasRepartidorProvider getProviderOverride(
    covariant HistorialVentasRepartidorProvider provider,
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
  String? get name => r'historialVentasRepartidorProvider';
}

/// Provider para historial de ventas del repartidor.
///
/// Copied from [historialVentasRepartidor].
class HistorialVentasRepartidorProvider
    extends AutoDisposeFutureProvider<List<VentaRepartidorDia>> {
  /// Provider para historial de ventas del repartidor.
  ///
  /// Copied from [historialVentasRepartidor].
  HistorialVentasRepartidorProvider(int repartidorId)
    : this._internal(
        (ref) => historialVentasRepartidor(
          ref as HistorialVentasRepartidorRef,
          repartidorId,
        ),
        from: historialVentasRepartidorProvider,
        name: r'historialVentasRepartidorProvider',
        debugGetCreateSourceHash: const bool.fromEnvironment('dart.vm.product')
            ? null
            : _$historialVentasRepartidorHash,
        dependencies: HistorialVentasRepartidorFamily._dependencies,
        allTransitiveDependencies:
            HistorialVentasRepartidorFamily._allTransitiveDependencies,
        repartidorId: repartidorId,
      );

  HistorialVentasRepartidorProvider._internal(
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
  Override overrideWith(
    FutureOr<List<VentaRepartidorDia>> Function(
      HistorialVentasRepartidorRef provider,
    )
    create,
  ) {
    return ProviderOverride(
      origin: this,
      override: HistorialVentasRepartidorProvider._internal(
        (ref) => create(ref as HistorialVentasRepartidorRef),
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
  AutoDisposeFutureProviderElement<List<VentaRepartidorDia>> createElement() {
    return _HistorialVentasRepartidorProviderElement(this);
  }

  @override
  bool operator ==(Object other) {
    return other is HistorialVentasRepartidorProvider &&
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
mixin HistorialVentasRepartidorRef
    on AutoDisposeFutureProviderRef<List<VentaRepartidorDia>> {
  /// The parameter `repartidorId` of this provider.
  int get repartidorId;
}

class _HistorialVentasRepartidorProviderElement
    extends AutoDisposeFutureProviderElement<List<VentaRepartidorDia>>
    with HistorialVentasRepartidorRef {
  _HistorialVentasRepartidorProviderElement(super.provider);

  @override
  int get repartidorId =>
      (origin as HistorialVentasRepartidorProvider).repartidorId;
}

String _$reportesControllerHash() =>
    r'3bbed31016d41cd19d0b381062398f37e596d227';

/// Controlador de reportes (admin).
///
/// Copied from [ReportesController].
@ProviderFor(ReportesController)
final reportesControllerProvider =
    AutoDisposeAsyncNotifierProvider<
      ReportesController,
      ResumenRapido
    >.internal(
      ReportesController.new,
      name: r'reportesControllerProvider',
      debugGetCreateSourceHash: const bool.fromEnvironment('dart.vm.product')
          ? null
          : _$reportesControllerHash,
      dependencies: null,
      allTransitiveDependencies: null,
    );

typedef _$ReportesController = AutoDisposeAsyncNotifier<ResumenRapido>;
// ignore_for_file: type=lint
// ignore_for_file: subtype_of_sealed_class, invalid_use_of_internal_member, invalid_use_of_visible_for_testing_member, deprecated_member_use_from_same_package
