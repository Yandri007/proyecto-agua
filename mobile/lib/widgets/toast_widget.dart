import 'package:flutter/material.dart';

import '../themes/app_colors.dart';

/// Muestra un toast/snackbar estilizado.
void showAquaToast(
  BuildContext context,
  String message, {
  AquaToastType type = AquaToastType.success,
}) {
  final color = switch (type) {
    AquaToastType.success => AppColors.success,
    AquaToastType.error => AppColors.danger,
    AquaToastType.info => AppColors.info,
    AquaToastType.warning => AppColors.warning,
  };

  final icon = switch (type) {
    AquaToastType.success => Icons.check_circle,
    AquaToastType.error => Icons.error,
    AquaToastType.info => Icons.info,
    AquaToastType.warning => Icons.warning_amber_rounded,
  };

  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Row(
        children: [
          Icon(icon, color: Colors.white, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
      backgroundColor: color,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(50)),
      margin: const EdgeInsets.only(bottom: 20, left: 20, right: 20),
      duration: const Duration(seconds: 3),
    ),
  );
}

enum AquaToastType { success, error, info, warning }
