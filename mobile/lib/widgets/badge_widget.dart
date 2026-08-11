import 'package:flutter/material.dart';

import '../themes/app_colors.dart';

/// Badge de estado para pedidos.
class BadgeWidget extends StatelessWidget {
  final String estado;

  const BadgeWidget({super.key, required this.estado});

  @override
  Widget build(BuildContext context) {
    final config = _getConfig();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: config.color,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        config.text,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  _BadgeConfig _getConfig() {
    switch (estado) {
      case 'pendiente':
        return _BadgeConfig('⏳ Pendiente', AppColors.warning);
      case 'en_camino':
        return _BadgeConfig('🚚 En camino', AppColors.info);
      case 'entregado':
        return _BadgeConfig('✅ Entregado', AppColors.success);
      case 'cancelado':
        return _BadgeConfig('❌ Cancelado', AppColors.danger);
      default:
        return _BadgeConfig(estado, AppColors.textMuted);
    }
  }
}

class _BadgeConfig {
  final String text;
  final Color color;
  _BadgeConfig(this.text, this.color);
}
