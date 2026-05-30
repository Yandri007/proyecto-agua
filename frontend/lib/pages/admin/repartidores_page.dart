import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../logic/repartidores_logic.dart';
import '../../themes/app_colors.dart';
import '../../widgets/aqua_button.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/toast_widget.dart';

/// Página de gestión de repartidores del admin.
class RepartidoresPage extends HookConsumerWidget {
  const RepartidoresPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repartidoresAsync = ref.watch(repartidoresControllerProvider);

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        AquaButton(
          text: 'Nuevo Repartidor',
          icon: Icons.person_add,
          onPressed: () => _showRepartidorDialog(context, ref),
        ),
        const SizedBox(height: 20),
        repartidoresAsync.when(
          data: (repartidores) {
            if (repartidores.isEmpty) {
              return const Center(
                child: Padding(
                  padding: EdgeInsets.all(40),
                  child: Text('No hay repartidores registrados'),
                ),
              );
            }
            return Container(
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
                    DataColumn(label: Text('Nombre')),
                    DataColumn(label: Text('Email')),
                    DataColumn(label: Text('Teléfono')),
                    DataColumn(label: Text('Acciones')),
                  ],
                  rows: repartidores.map((r) {
                    return DataRow(cells: [
                      DataCell(Text('${r.id}')),
                      DataCell(Text(r.nombre)),
                      DataCell(Text(r.email)),
                      DataCell(Text(r.telefono ?? '-')),
                      DataCell(
                        IconButton(
                          icon: const Icon(Icons.delete, size: 18),
                          color: AppColors.danger,
                          onPressed: () async {
                            final confirm = await showDialog<bool>(
                              context: context,
                              builder: (_) => AlertDialog(
                                title: const Text('¿Eliminar repartidor?'),
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
                                  .read(repartidoresControllerProvider.notifier)
                                  .eliminar(r.id);
                              if (context.mounted) {
                                showAquaToast(context, 'Repartidor eliminado');
                              }
                            }
                          },
                        ),
                      ),
                    ]);
                  }).toList(),
                ),
              ),
            );
          },
          loading: () => const LoadingWidget(),
          error: (e, _) => Text('Error: $e'),
        ),
      ],
    );
  }

  void _showRepartidorDialog(BuildContext context, WidgetRef ref) {
    final nombreCtrl = TextEditingController();
    final emailCtrl = TextEditingController();
    final passwordCtrl = TextEditingController();
    final telefonoCtrl = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Nuevo Repartidor'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nombreCtrl,
                decoration: const InputDecoration(labelText: 'Nombre'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: emailCtrl,
                decoration: const InputDecoration(labelText: 'Email'),
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: passwordCtrl,
                decoration: const InputDecoration(labelText: 'Contraseña'),
                obscureText: true,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: telefonoCtrl,
                decoration: const InputDecoration(labelText: 'Teléfono'),
                keyboardType: TextInputType.phone,
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
              if (nombreCtrl.text.isEmpty ||
                  emailCtrl.text.isEmpty ||
                  passwordCtrl.text.isEmpty) {
                showAquaToast(context, 'Complete todos los campos',
                    type: AquaToastType.error);
                return;
              }
              await ref
                  .read(repartidoresControllerProvider.notifier)
                  .registrar(
                    nombre: nombreCtrl.text,
                    email: emailCtrl.text,
                    password: passwordCtrl.text,
                    telefono: telefonoCtrl.text.isNotEmpty
                        ? telefonoCtrl.text
                        : null,
                  );
              if (context.mounted) {
                Navigator.pop(context);
                showAquaToast(context, 'Repartidor registrado');
              }
            },
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }
}
