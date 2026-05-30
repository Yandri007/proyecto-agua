import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../logic/carrito_logic.dart';
import '../../logic/pedidos_logic.dart';
import '../../logic/productos_logic.dart';
import '../../models/pedido_model.dart';
import '../../themes/app_colors.dart';
import '../../widgets/aqua_button.dart';
import '../../widgets/aqua_card.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/toast_widget.dart';

/// Catálogo de productos con carrito lateral/inferior.
class CatalogoPage extends HookConsumerWidget {
  const CatalogoPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productosAsync = ref.watch(productosControllerProvider);
    final carrito = ref.watch(carritoControllerProvider);
    final isWide = MediaQuery.of(context).size.width > 800;

    Widget catalogoGrid = productosAsync.when(
      data: (productos) => GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: isWide ? 4 : 2,
          childAspectRatio: 0.85,
          crossAxisSpacing: 16,
          mainAxisSpacing: 16,
        ),
        itemCount: productos.length,
        itemBuilder: (context, index) {
          final p = productos[index];
          return AquaCard(
            onTap: () {
              ref.read(carritoControllerProvider.notifier).agregar(p);
              showAquaToast(context, '${p.nombre} agregado al carrito');
            },
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text('💧', style: TextStyle(fontSize: 40)),
                const SizedBox(height: 8),
                Text(
                  p.nombre,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  '\$${p.precio.toStringAsFixed(2)}',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: AppColors.success,
                  ),
                ),
                const SizedBox(height: 8),
                AquaButton(
                  text: 'Agregar',
                  onPressed: () {
                    ref.read(carritoControllerProvider.notifier).agregar(p);
                    showAquaToast(context, '${p.nombre} agregado');
                  },
                  fullWidth: true,
                  fontSize: 13,
                ),
              ],
            ),
          );
        },
      ),
      loading: () => const LoadingWidget(),
      error: (e, _) => Center(child: Text('Error: $e')),
    );

    Widget carritoWidget = _buildCarrito(context, ref, carrito);

    if (isWide) {
      return Row(
        children: [
          Expanded(
            flex: 3,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('🛒 Productos',
                        style: TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w600)),
                  ),
                  catalogoGrid,
                ],
              ),
            ),
          ),
          SizedBox(
            width: 350,
            child: carritoWidget,
          ),
        ],
      );
    }

    return Stack(
      children: [
        SingleChildScrollView(
          padding: const EdgeInsets.only(bottom: 80),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text('🛒 Productos',
                    style:
                        TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
              ),
              catalogoGrid,
            ],
          ),
        ),
        // Botón flotante del carrito (mobile)
        if (carrito.isNotEmpty)
          Positioned(
            bottom: 16,
            left: 16,
            right: 16,
            child: GestureDetector(
              onTap: () => _showCarritoBottomSheet(context, ref, carrito),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: BorderRadius.circular(40),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.primary.withValues(alpha: 0.3),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '🛍️ ${carrito.length} items',
                      style: const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.w600),
                    ),
                    Text(
                      '\$${ref.read(carritoControllerProvider.notifier).total.toStringAsFixed(2)}',
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 18),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildCarrito(
      BuildContext context, WidgetRef ref, List<CarritoItem> carrito) {
    final total = ref.read(carritoControllerProvider.notifier).total;

    return AquaCard(
      margin: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('🛍️ Tu Pedido',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          const SizedBox(height: 16),
          if (carrito.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: Text('Carrito vacío',
                    style: TextStyle(color: AppColors.textMuted)),
              ),
            )
          else ...[
            ...carrito.asMap().entries.map((entry) {
              final i = entry.key;
              final item = entry.value;
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        '${item.producto.nombre} x${item.cantidad}',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Text('\$${item.subtotal.toStringAsFixed(2)}'),
                    IconButton(
                      icon: const Icon(Icons.close, size: 16,
                          color: AppColors.danger),
                      onPressed: () => ref
                          .read(carritoControllerProvider.notifier)
                          .remover(i),
                    ),
                  ],
                ),
              );
            }),
            const Divider(),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Total:',
                    style: TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w700)),
                Text('\$${total.toStringAsFixed(2)}',
                    style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppColors.primary)),
              ],
            ),
            const SizedBox(height: 16),
            AquaButton(
              text: '✅ Confirmar Pedido',
              variant: AquaButtonVariant.success,
              fullWidth: true,
              onPressed: () => _realizarPedido(context, ref),
            ),
          ],
        ],
      ),
    );
  }

  void _showCarritoBottomSheet(
      BuildContext context, WidgetRef ref, List<CarritoItem> carrito) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: _buildCarrito(context, ref, carrito),
      ),
    );
  }

  Future<void> _realizarPedido(BuildContext context, WidgetRef ref) async {
    final carrito = ref.read(carritoControllerProvider);
    if (carrito.isEmpty) return;

    try {
      final items = carrito
          .map((item) => PedidoItem(
                productoId: item.producto.id,
                cantidad: item.cantidad,
              ))
          .toList();

      await ref.read(pedidosClienteControllerProvider.notifier).crearPedido(
            productos: items,
            direccionEntrega: 'Mi dirección',
          );

      ref.read(carritoControllerProvider.notifier).vaciar();

      if (context.mounted) {
        showAquaToast(context, '¡Pedido realizado! 🎉');
      }
    } catch (e) {
      if (context.mounted) {
        showAquaToast(context, 'Error al realizar pedido',
            type: AquaToastType.error);
      }
    }
  }
}
