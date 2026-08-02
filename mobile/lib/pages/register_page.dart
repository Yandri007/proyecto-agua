import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:go_router/go_router.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../logic/auth_logic.dart';
import '../routes/app_routes.dart';
import '../themes/app_colors.dart';
import '../widgets/aqua_button.dart';
import '../widgets/aqua_text_field.dart';
import '../widgets/toast_widget.dart';

/// Página de registro de nuevos clientes.
class RegisterPage extends HookConsumerWidget {
  const RegisterPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nombreController = useTextEditingController();
    final emailController = useTextEditingController();
    final passwordController = useTextEditingController();
    final telefonoController = useTextEditingController();
    final obscurePassword = useState(true);
    final isLoading = useState(false);
    final formKey = useMemoized(() => GlobalKey<FormState>());

    Future<void> handleRegister() async {
      if (!formKey.currentState!.validate()) return;

      isLoading.value = true;
      try {
        await ref.read(authControllerProvider.notifier).register(
              nombre: nombreController.text.trim(),
              email: emailController.text.trim(),
              password: passwordController.text,
              telefono: telefonoController.text.trim().isNotEmpty
                  ? telefonoController.text.trim()
                  : null,
            );

        if (!context.mounted) return;
        showAquaToast(context, '¡Registro exitoso! Bienvenido 🎉');
        context.go(AppRoutes.clienteCatalogo);
      } catch (e) {
        if (context.mounted) {
          showAquaToast(context, 'Error al registrar. Intenta de nuevo.',
              type: AquaToastType.error);
        }
      } finally {
        isLoading.value = false;
      }
    }

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.heroGradient),
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Container(
                padding: const EdgeInsets.all(40),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.1),
                      blurRadius: 40,
                      offset: const Offset(0, 20),
                    ),
                  ],
                ),
                child: Form(
                  key: formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          gradient: AppColors.primaryGradient,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Center(
                          child: Text('💧', style: TextStyle(fontSize: 40)),
                        ),
                      ),
                      const SizedBox(height: 24),
                      const Text(
                        'Crear cuenta gratis',
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 32),

                      AquaTextField(
                        controller: nombreController,
                        hintText: 'Nombre completo',
                        prefixIcon: Icons.person_outline,
                        validator: (v) =>
                            v == null || v.isEmpty ? 'Nombre requerido' : null,
                      ),
                      const SizedBox(height: 16),

                      AquaTextField(
                        controller: emailController,
                        hintText: 'Correo electrónico',
                        prefixIcon: Icons.email_outlined,
                        keyboardType: TextInputType.emailAddress,
                        validator: (v) {
                          if (v == null || v.isEmpty) return 'Correo requerido';
                          if (!v.contains('@')) return 'Correo inválido';
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),

                      AquaTextField(
                        controller: passwordController,
                        hintText: 'Contraseña',
                        prefixIcon: Icons.lock_outline,
                        obscureText: obscurePassword.value,
                        suffixIcon: IconButton(
                          icon: Icon(
                            obscurePassword.value
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                          ),
                          onPressed: () =>
                              obscurePassword.value = !obscurePassword.value,
                        ),
                        validator: (v) {
                          if (v == null || v.isEmpty) {
                            return 'Contraseña requerida';
                          }
                          if (v.length < 6) return 'Mínimo 6 caracteres';
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),

                      AquaTextField(
                        controller: telefonoController,
                        hintText: 'Teléfono (opcional)',
                        prefixIcon: Icons.phone_outlined,
                        keyboardType: TextInputType.phone,
                      ),
                      const SizedBox(height: 24),

                      AquaButton(
                        text: 'Registrarse',
                        onPressed: handleRegister,
                        isLoading: isLoading.value,
                        fullWidth: true,
                        icon: Icons.person_add,
                      ),
                      const SizedBox(height: 20),

                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Text(
                            '¿Ya tienes cuenta? ',
                            style: TextStyle(color: AppColors.textMuted),
                          ),
                          GestureDetector(
                            onTap: () => context.go(AppRoutes.login),
                            child: const Text(
                              'Iniciar sesión',
                              style: TextStyle(
                                color: AppColors.primary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
