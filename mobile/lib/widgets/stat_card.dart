import 'package:flutter/material.dart';

import '../themes/app_colors.dart';
import '../themes/app_typography.dart';
import 'aqua_card.dart';

/// Card de estadística para el dashboard (ventas, pedidos, etc).
class StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color? iconColor;

  const StatCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    return AquaCard(
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: AppTypography.statNumber,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  label,
                  style: AppTypography.statLabel,
                ),
              ],
            ),
          ),
          Icon(
            icon,
            size: 40,
            color: (iconColor ?? AppColors.primary).withValues(alpha: 0.5),
          ),
        ],
      ),
    );
  }
}
