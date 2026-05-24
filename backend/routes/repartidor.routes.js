const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Obtener pedidos asignados al repartidor
router.get('/pedidos/:repartidorId', async (req, res) => {
  try {
    const { repartidorId } = req.params;
    const result = await pool.query(
      `SELECT p.*, u.nombre as cliente_nombre, u.telefono as cliente_telefono, u.direccion as cliente_direccion
      FROM pedidos p
      LEFT JOIN usuarios u ON p.cliente_id = u.id
      WHERE p.repartidor_id = $1 AND p.estado IN ('pendiente', 'en_camino')
      ORDER BY p.created_at ASC`,
      [repartidorId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener historial de entregas del repartidor
router.get('/historial/:repartidorId', async (req, res) => {
  try {
    const { repartidorId } = req.params;
    const result = await pool.query(
      `SELECT p.*, u.nombre as cliente_nombre
      FROM pedidos p
      LEFT JOIN usuarios u ON p.cliente_id = u.id
      WHERE p.repartidor_id = $1 AND p.estado = 'entregado'
      ORDER BY p.created_at DESC`,
      [repartidorId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener estadísticas del repartidor
router.get('/estadisticas/:repartidorId', async (req, res) => {
  try {
    const { repartidorId } = req.params;
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_pedidos,
        SUM(CASE WHEN estado = 'entregado' THEN 1 ELSE 0 END) as entregados,
        SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) as pendientes,
        COALESCE(SUM(total), 0) as total_ventas
      FROM pedidos
      WHERE repartidor_id = $1`,
      [repartidorId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;