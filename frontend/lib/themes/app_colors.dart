import 'package:flutter/material.dart';

/// Paleta de colores de AquaControl basada en el branding existente.
/// Tonalidades de azul agua + acentos verdes para acciones positivas.
class AppColors {
  AppColors._();

  // Primarios (azul agua)
  static const Color primary = Color(0xFF0077B6);
  static const Color primaryLight = Color(0xFF00B4D8);
  static const Color primaryDark = Color(0xFF023E8A);

  // Secundarios
  static const Color secondary = Color(0xFF0F3460);
  static const Color secondaryLight = Color(0xFF16213E);

  // Acentos
  static const Color accent = Color(0xFFFFE66D);
  static const Color success = Color(0xFF2ECC71);
  static const Color warning = Color(0xFFF39C12);
  static const Color danger = Color(0xFFE74C3C);
  static const Color info = Color(0xFF3498DB);

  // Fondos
  static const Color scaffoldLight = Color(0xFFF5F7FA);
  static const Color scaffoldDark = Color(0xFF1A1A2E);
  static const Color cardLight = Color(0xFFFFFFFF);
  static const Color cardDark = Color(0xFF16213E);

  // Texto
  static const Color textPrimary = Color(0xFF1A1A2E);
  static const Color textSecondary = Color(0xFF666666);
  static const Color textMuted = Color(0xFF888888);
  static const Color textOnPrimary = Color(0xFFFFFFFF);

  // Bordes y separadores
  static const Color border = Color(0xFFE0E6ED);
  static const Color divider = Color(0xFFE0E6ED);

  // Gradientes
  static const LinearGradient primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primary, primaryLight],
  );

  static const LinearGradient heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFF0F9FF), Color(0xFFE0F7FA)],
  );

  static const LinearGradient sidebarGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF1A1A2E), Color(0xFF16213E)],
  );

  static const LinearGradient ctaGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primary, primaryDark],
  );
}
