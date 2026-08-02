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

/// Página de login unificada.
/// Detecta el rol del usuario y redirige automáticamente.
class LoginPage extends HookConsumerWidget {
  const LoginPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final emailController = useTextEditingController();
    final passwordController = useTextEditingController();
    final obscurePassword = useState(true);
    final isLoading = useState(false);
    final formKey = useMemoized(() => GlobalKey<FormState>());

    Future<void> handleLogin() async {
      if (!formKey.currentState!.validate()) return;

      isLoading.value = true;
      try {
        final user = await ref.read(authControllerProvider.notifier).login(
              emailController.text.trim(),
              passwordController.text,
            );

        if (!context.mounted) return;

        switch (user.rol) {
          case 'admin':
            context.go(AppRoutes.adminDashboard);
          case 'cliente':
            context.go(AppRoutes.clienteCatalogo);
          case 'repartidor':
            context.go(AppRoutes.repartidorPedidos);
          default:
            context.go(AppRoutes.login);
        }
      } catch (e) {
        if (context.mounted) {
          showAquaToast(context, 'Credenciales inválidas',
              type: AquaToastType.error);
        }
      } finally {
        isLoading.value = false;
      }
    }

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: AppColors.heroGradient,
        ),
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
                      // Logo
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
                      ShaderMask(
                        shaderCallback: (bounds) =>
                            AppColors.primaryGradient.createShader(bounds),
                        child: const Text(
                          'AquaControl',
                          style: TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Inicia sesión para continuar',
                        style: TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 32),

                      // Email
                      AquaTextField(
                        controller: emailController,
                        hintText: 'Correo electrónico',
                        prefixIcon: Icons.email_outlined,
                        keyboardType: TextInputType.emailAddress,
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return 'Ingresa tu correo';
                          }
                          if (!value.contains('@')) {
                            return 'Correo inválido';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),

                      // Password
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
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return 'Ingresa tu contraseña';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 24),

                      // Botón login
                      AquaButton(
                        text: 'Ingresar',
                        onPressed: handleLogin,
                        isLoading: isLoading.value,
                        fullWidth: true,
                        icon: Icons.login,
                      ),
                      const SizedBox(height: 20),

                      // Link a registro
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Text(
                            '¿No tienes cuenta? ',
                            style: TextStyle(color: AppColors.textMuted),
                          ),
                          GestureDetector(
                            onTap: () => context.go(AppRoutes.register),
                            child: const Text(
                              'Regístrate gratis',
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
