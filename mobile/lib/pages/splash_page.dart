import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:go_router/go_router.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../logic/auth_logic.dart';
import '../routes/app_routes.dart';
import '../themes/app_colors.dart';

/// Splash screen con animación del logo de AquaControl.
/// Redirige automáticamente según la sesión almacenada.
class SplashPage extends HookConsumerWidget {
  const SplashPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final opacity = useState(0.0);
    final scale = useState(0.5);

    useEffect(() {
      // Iniciar animación
      Future.delayed(const Duration(milliseconds: 100), () {
        opacity.value = 1.0;
        scale.value = 1.0;
      });

      // Verificar sesión y redirigir
      Future.delayed(const Duration(seconds: 2), () {
        final authState = ref.read(authControllerProvider);
        final router = GoRouter.of(context);
        authState.when(
          data: (user) {
            if (user != null) {
              _redirectByRole(router, user.rol);
            } else {
              router.go(AppRoutes.login);
            }
          },
          loading: () {
            Future.delayed(const Duration(seconds: 1), () {
              router.go(AppRoutes.login);
            });
          },
          error: (e, st) => router.go(AppRoutes.login),
        );
      });

      return null;
    }, const []);

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: AppColors.ctaGradient,
        ),
        child: Center(
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 800),
            opacity: opacity.value,
            child: AnimatedScale(
              duration: const Duration(milliseconds: 800),
              scale: scale.value,
              curve: Curves.easeOutBack,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Logo animado
                  Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(30),
                    ),
                    child: const Center(
                      child: Text(
                        '💧',
                        style: TextStyle(fontSize: 64),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'AquaControl',
                    style: TextStyle(
                      fontSize: 36,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      letterSpacing: -1,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Gestión inteligente de agua',
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.white.withValues(alpha: 0.8),
                    ),
                  ),
                  const SizedBox(height: 48),
                  const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _redirectByRole(GoRouter router, String rol) {
    switch (rol) {
      case 'admin':
        router.go(AppRoutes.adminDashboard);
      case 'cliente':
        router.go(AppRoutes.clienteCatalogo);
      case 'repartidor':
        router.go(AppRoutes.repartidorPedidos);
      default:
        router.go(AppRoutes.login);
    }
  }
}
