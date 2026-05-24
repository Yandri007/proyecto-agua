const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { verifyToken, checkRole } = require('../middleware/auth');

// Obtener todo el inventario (público)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener producto por ID (público)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM productos WHERE id = $1', [id]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔥 Crear nuevo producto (solo admin)
router.post('/', verifyToken, checkRole(['admin']), async (req, res) => {
  try {
    const { nombre, tipo, precio, stock, stock_minimo } = req.body;
    const result = await pool.query(
      'INSERT INTO productos (nombre, tipo, precio, stock, stock_minimo) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [nombre, tipo, precio, stock, stock_minimo]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔥 Actualizar producto (solo admin)
router.put('/:id', verifyToken, checkRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, tipo, precio, stock, stock_minimo } = req.body;
    await pool.query(
      'UPDATE productos SET nombre=$1, tipo=$2, precio=$3, stock=$4, stock_minimo=$5 WHERE id=$6',
      [nombre, tipo, precio, stock, stock_minimo, id]
    );
    res.json({ message: 'Producto actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔥 Eliminar producto (solo admin)
router.delete('/:id', verifyToken, checkRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM productos WHERE id=$1', [id]);
    res.json({ message: 'Producto eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reporte de productos con stock bajo (solo admin)
router.get('/reporte/stock-bajo', verifyToken, checkRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM productos WHERE stock <= stock_minimo ORDER BY stock ASC'
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;