import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../logic/productos_logic.dart';
import '../../themes/app_colors.dart';
import '../../widgets/aqua_button.dart';
import '../../widgets/aqua_text_field.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/toast_widget.dart';

/// Página de inventario del admin con CRUD de productos.
class InventarioPage extends HookConsumerWidget {
  const InventarioPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productosAsync = ref.watch(productosControllerProvider);
    final busqueda = useState('');

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        // Barra de acciones
        Row(
          children: [
            Expanded(
              child: AquaTextField(
                hintText: 'Buscar producto...',
                prefixIcon: Icons.search,
                onChanged: (v) => busqueda.value = v,
              ),
            ),
            const SizedBox(width: 12),
            AquaButton(
              text: 'Nuevo Producto',
              icon: Icons.add,
              onPressed: () => _showProductoDialog(context, ref),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // Tabla
        productosAsync.when(
          data: (productos) {
            var filtered = productos;
            if (busqueda.value.isNotEmpty) {
              filtered = productos
                  .where((p) => p.nombre
                      .toLowerCase()
                      .contains(busqueda.value.toLowerCase()))
                  .toList();
            }

            // Stats
            final valorTotal =
                filtered.fold<double>(0, (s, p) => s + p.precio * p.stock);
            final stockBajo =
                filtered.where((p) => p.stock <= p.stockMinimo).length;

            return Column(
              children: [
                // Stats rápidas
                Row(
                  children: [
                    Expanded(
                      child: _StatMini(
                        label: 'Valor Inventario',
                        value: '\$${valorTotal.toStringAsFixed(2)}',
                        icon: Icons.attach_money,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: _StatMini(
                        label: 'Stock Bajo',
                        value: '$stockBajo',
                        icon: Icons.warning_amber,
                        color: stockBajo > 0 ? AppColors.danger : AppColors.success,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.05),
                        blurRadius: 8,
                      ),
                    ],
                  ),
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: DataTable(
                      columns: const [
                        DataColumn(label: Text('ID')),
                        DataColumn(label: Text('Producto')),
                        DataColumn(label: Text('Tipo')),
                        DataColumn(label: Text('Precio')),
                        DataColumn(label: Text('Stock')),
                        DataColumn(label: Text('Stock Mín')),
                        DataColumn(label: Text('Acciones')),
                      ],
                      rows: filtered.map((p) {
                        final isLow = p.stock <= p.stockMinimo;
                        return DataRow(cells: [
                          DataCell(Text('${p.id}')),
                          DataCell(Text(p.nombre)),
                          DataCell(Text(p.tipo)),
                          DataCell(Text('\$${p.precio.toStringAsFixed(2)}')),
                          DataCell(Text(
                            '${p.stock}',
                            style: TextStyle(
                              color: isLow ? AppColors.danger : AppColors.success,
                              fontWeight: FontWeight.w600,
                            ),
                          )),
                          DataCell(Text('${p.stockMinimo}')),
                          DataCell(Row(
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, size: 18),
                                color: AppColors.primary,
                                onPressed: () =>
                                    _showProductoDialog(context, ref, producto: p),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, size: 18),
                                color: AppColors.danger,
                                onPressed: () async {
                                  final confirm = await showDialog<bool>(
                                    context: context,
                                    builder: (_) => AlertDialog(
                                      title: const Text('¿Eliminar producto?'),
                                      actions: [
                                        TextButton(
                                          onPressed: () =>
                                              Navigator.pop(context, false),
                                          child: const Text('Cancelar'),
                                        ),
                                        TextButton(
                                          onPressed: () =>
                                              Navigator.pop(context, true),
                                          child: const Text('Eliminar'),
                                        ),
                                      ],
                                    ),
                                  );
                                  if (confirm == true) {
                                    await ref
                                        .read(productosControllerProvider.notifier)
                                        .eliminar(p.id);
                                    if (context.mounted) {
                                      showAquaToast(context, 'Producto eliminado');
                                    }
                                  }
                                },
                              ),
                            ],
                          )),
                        ]);
                      }).toList(),
                    ),
                  ),
                ),
              ],
            );
          },
          loading: () => const LoadingWidget(),
          error: (e, _) => Text('Error: $e'),
        ),
      ],
    );
  }

  void _showProductoDialog(BuildContext context, WidgetRef ref,
      {dynamic producto}) {
    final nombreCtrl =
        TextEditingController(text: producto?.nombre ?? '');
    final precioCtrl =
        TextEditingController(text: producto?.precio.toString() ?? '');
    final stockCtrl =
        TextEditingController(text: producto?.stock.toString() ?? '');
    final stockMinCtrl =
        TextEditingController(text: producto?.stockMinimo.toString() ?? '10');
    String tipo = producto?.tipo ?? 'bidon';

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(producto != null ? 'Editar Producto' : 'Nuevo Producto'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nombreCtrl,
                  decoration: const InputDecoration(labelText: 'Nombre'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: tipo,
                  decoration: const InputDecoration(labelText: 'Tipo'),
                  items: const [
                    DropdownMenuItem(value: 'bidon', child: Text('Bidón 20L')),
                    DropdownMenuItem(value: 'galon', child: Text('Galón 5L')),
                    DropdownMenuItem(
                        value: 'paca_botellas',
                        child: Text('Paca de botellas')),
                    DropdownMenuItem(
                        value: 'botella', child: Text('Botella 1L')),
                  ],
                  onChanged: (v) => setState(() => tipo = v!),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: precioCtrl,
                  decoration: const InputDecoration(labelText: 'Precio'),
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: stockCtrl,
                  decoration: const InputDecoration(labelText: 'Stock'),
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: stockMinCtrl,
                  decoration:
                      const InputDecoration(labelText: 'Stock mínimo'),
                  keyboardType: TextInputType.number,
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar'),
            ),
            ElevatedButton(
              onPressed: () async {
                final notifier =
                    ref.read(productosControllerProvider.notifier);
                if (producto != null) {
                  await notifier.editar(
                    id: producto.id,
                    nombre: nombreCtrl.text,
                    tipo: tipo,
                    precio: double.tryParse(precioCtrl.text) ?? 0,
                    stock: int.tryParse(stockCtrl.text) ?? 0,
                    stockMinimo: int.tryParse(stockMinCtrl.text) ?? 10,
                  );
                } else {
                  await notifier.crear(
                    nombre: nombreCtrl.text,
                    tipo: tipo,
                    precio: double.tryParse(precioCtrl.text) ?? 0,
                    stock: int.tryParse(stockCtrl.text) ?? 0,
                    stockMinimo: int.tryParse(stockMinCtrl.text) ?? 10,
                  );
                }
                if (context.mounted) {
                  Navigator.pop(context);
                  showAquaToast(context, 'Producto guardado');
                }
              },
              child: const Text('Guardar'),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatMini extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color? color;

  const _StatMini({
    required this.label,
    required this.value,
    required this.icon,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
          ),
        ],
      ),
      child: Row(
        children: [
          Icon(icon, color: color ?? AppColors.primary, size: 32),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
              Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color ?? AppColors.primary)),
            ],
          ),
        ],
      ),
    );
  }
}
