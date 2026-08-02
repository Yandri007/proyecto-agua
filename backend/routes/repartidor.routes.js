const express = require('express');
const pool = require('../config/database');
const { verifyToken, checkRole } = require('../middleware/auth');
const { requireActiveSubscription } = require('../utils/plans');

const router = express.Router();

router.use(verifyToken, checkRole(['repartidor']), requireActiveSubscription);

router.get('/pedidos', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.nombre AS cliente_nombre, u.telefono AS cliente_telefono,
              EXISTS (SELECT 1 FROM comprobantes_entrega ce WHERE ce.pedido_id = p.id) AS tiene_comprobante,
              COALESCE(
                json_agg(
                  json_build_object(
                    'producto_id', pr.id,
                    'nombre', pr.nombre,
                    'cantidad', dp.cantidad,
                    'precio_unitario', dp.precio_unitario,
                    'es_retornable', dp.es_retornable,
                    'deposito_envase', dp.deposito_unitario
                  ) ORDER BY dp.id
                ) FILTER (WHERE dp.id IS NOT NULL),
                '[]'::json
              ) AS productos
       FROM pedidos p
       JOIN usuarios u ON u.id = p.cliente_id
       LEFT JOIN detalle_pedidos dp ON dp.pedido_id = p.id
       LEFT JOIN productos pr ON pr.id = dp.producto_id
       WHERE p.empresa_id = $1
         AND p.repartidor_id = $2
         AND p.estado IN ('asignado', 'en_camino')
       GROUP BY p.id, u.nombre, u.telefono
       ORDER BY p.created_at ASC`,
      [req.user.empresa_id, req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error cargando pedidos del repartidor:', error);
    return res.status(500).json({ error: 'No fue posible cargar los pedidos' });
  }
});

router.get('/historial', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.nombre AS cliente_nombre, u.telefono AS cliente_telefono,
              EXISTS (SELECT 1 FROM comprobantes_entrega ce WHERE ce.pedido_id = p.id) AS tiene_comprobante,
              COALESCE(
                json_agg(
                  json_build_object(
                    'producto_id', pr.id,
                    'nombre', pr.nombre,
                    'cantidad', dp.cantidad,
                    'precio_unitario', dp.precio_unitario,
                    'es_retornable', dp.es_retornable,
                    'deposito_envase', dp.deposito_unitario
                  ) ORDER BY dp.id
                ) FILTER (WHERE dp.id IS NOT NULL),
                '[]'::json
              ) AS productos
       FROM pedidos p
       JOIN usuarios u ON u.id = p.cliente_id
       LEFT JOIN detalle_pedidos dp ON dp.pedido_id = p.id
       LEFT JOIN productos pr ON pr.id = dp.producto_id
       WHERE p.empresa_id = $1
         AND p.repartidor_id = $2
         AND p.estado IN ('entregado', 'cancelado')
       GROUP BY p.id, u.nombre, u.telefono
       ORDER BY COALESCE(p.entregado_en, p.actualizado_en) DESC
       LIMIT 100`,
      [req.user.empresa_id, req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error cargando historial del repartidor:', error);
    return res.status(500).json({ error: 'No fue posible cargar el historial' });
  }
});

router.get('/estadisticas', async (req, res) => {
  try {
    const result = await pool.query(
      `WITH pedidos_resumen AS (
         SELECT COUNT(*)::INT AS total_pedidos,
                COUNT(*) FILTER (WHERE estado = 'entregado')::INT AS entregados,
                COUNT(*) FILTER (WHERE estado IN ('asignado', 'en_camino'))::INT AS pendientes,
                COALESCE(SUM(total) FILTER (WHERE estado = 'entregado'), 0) AS ventas_entregas
         FROM pedidos
         WHERE empresa_id = $1 AND repartidor_id = $2
       ), ventas_resumen AS (
         SELECT COUNT(*) FILTER (WHERE estado_revision = 'pendiente')::INT AS ventas_pendientes,
                COUNT(*) FILTER (WHERE estado_revision = 'aprobada')::INT AS ventas_aprobadas,
                COALESCE(SUM(total) FILTER (WHERE estado_revision = 'aprobada'), 0) AS ventas_ruta
         FROM ventas_ruta
         WHERE empresa_id = $1 AND repartidor_id = $2
       )
       SELECT pr.total_pedidos, pr.entregados, pr.pendientes,
              vr.ventas_pendientes, vr.ventas_aprobadas,
              pr.ventas_entregas + vr.ventas_ruta AS total_ventas
       FROM pedidos_resumen pr CROSS JOIN ventas_resumen vr`,
      [req.user.empresa_id, req.user.id]
    );
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error cargando estadísticas del repartidor:', error);
    return res.status(500).json({ error: 'No fue posible cargar las estadísticas' });
  }
});

module.exports = router;
