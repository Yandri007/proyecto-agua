const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { verifyToken, checkRole } = require('../middleware/auth');

// Obtener todos los productos (público)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Inicializar productos de ejemplo (solo admin)
router.get('/inicializar', verifyToken, checkRole(['admin']), async (req, res) => {
  try {
    const check = await pool.query('SELECT COUNT(*) FROM productos');
    if (parseInt(check.rows[0].count) > 0) {
      return res.json({ message: 'Los productos ya están inicializados' });
    }

    const productosEjemplo = [
      { nombre: 'Bidón 20L', tipo: 'bidon', precio: 5.00, stock: 100, stock_minimo: 20 },
      { nombre: 'Galón 5L', tipo: 'galon', precio: 2.50, stock: 150, stock_minimo: 30 },
      { nombre: 'Paca de botellas (6 uds)', tipo: 'paca_botellas', precio: 4.00, stock: 80, stock_minimo: 15 },
      { nombre: 'Botella 1L', tipo: 'botella', precio: 1.00, stock: 200, stock_minimo: 50 }
    ];

    for (const p of productosEjemplo) {
      await pool.query(
        'INSERT INTO productos (nombre, tipo, precio, stock, stock_minimo) VALUES ($1, $2, $3, $4, $5)',
        [p.nombre, p.tipo, p.precio, p.stock, p.stock_minimo]
      );
    }
    res.json({ message: '✅ Productos inicializados correctamente', productos: productosEjemplo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Crear nuevo producto (solo admin)
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

// Actualizar producto (solo admin)
router.put('/:id', verifyToken, checkRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, tipo, precio, stock, stock_minimo } = req.body;
    await pool.query('UPDATE productos SET nombre=$1, tipo=$2, precio=$3, stock=$4, stock_minimo=$5 WHERE id=$6', 
      [nombre, tipo, precio, stock, stock_minimo, id]);
    res.json({ message: 'Producto actualizado' });
  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
});

// Eliminar producto (solo admin)
router.delete('/:id', verifyToken, checkRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM productos WHERE id=$1', [id]);
    res.json({ message: 'Producto eliminado' });
  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
});

module.exports = router;