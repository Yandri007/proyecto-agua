const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { verifyToken, checkRole } = require('../middleware/auth');
const { requireActiveSubscription } = require('../utils/plans');

const router = express.Router();

const validateProduct = [
  body('nombre').trim().isLength({ min: 2, max: 100 }).withMessage('Nombre de producto inválido'),
  body('tipo').trim().isLength({ min: 2, max: 50 }).withMessage('Tipo de producto inválido'),
  body('precio').isFloat({ min: 0, max: 999999 }).withMessage('Precio inválido'),
  body('stock').isInt({ min: 0, max: 1000000 }).withMessage('Stock inválido'),
  body('stock_minimo').isInt({ min: 0, max: 1000000 }).withMessage('Stock mínimo inválido'),
  body('es_retornable').optional().isBoolean().withMessage('Configuración de envase inválida').toBoolean(),
  body('deposito_envase').optional().isFloat({ min: 0, max: 999999 }).withMessage('Depósito de envase inválido').toFloat()
];

const validationHandler = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  return next();
};

router.use(verifyToken);
router.use(requireActiveSubscription);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, tipo, precio, stock, stock_minimo, es_retornable, deposito_envase
       FROM productos
       WHERE empresa_id = $1 AND activo = TRUE
       ORDER BY nombre`,
      [req.user.empresa_id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error cargando productos:', error);
    return res.status(500).json({ error: 'No fue posible cargar los productos' });
  }
});

router.get('/reporte/stock-bajo', checkRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, tipo, precio, stock, stock_minimo, es_retornable, deposito_envase
       FROM productos
       WHERE empresa_id = $1 AND activo = TRUE AND stock <= stock_minimo
       ORDER BY stock ASC`,
      [req.user.empresa_id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error cargando stock bajo:', error);
    return res.status(500).json({ error: 'No fue posible generar el reporte' });
  }
});

router.post('/inicializar', checkRole(['admin']), async (req, res) => {
  const productosEjemplo = [
    { nombre: 'Bidón 20L', tipo: 'bidon', precio: 5, stock: 100, stock_minimo: 20 },
    { nombre: 'Galón 5L', tipo: 'galon', precio: 2.5, stock: 150, stock_minimo: 30 },
    { nombre: 'Paca de botellas (6 uds)', tipo: 'paca_botellas', precio: 4, stock: 80, stock_minimo: 15 },
    { nombre: 'Botella 1L', tipo: 'botella', precio: 1, stock: 200, stock_minimo: 50 }
  ];

  try {
    const check = await pool.query(
      'SELECT 1 FROM productos WHERE empresa_id = $1 AND activo = TRUE LIMIT 1',
      [req.user.empresa_id]
    );
    if (check.rowCount > 0) {
      return res.json({ message: 'Los productos ya están inicializados' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const product of productosEjemplo) {
        await client.query(
          `INSERT INTO productos
            (empresa_id, nombre, tipo, precio, stock, stock_minimo)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            req.user.empresa_id,
            product.nombre,
            product.tipo,
            product.precio,
            product.stock,
            product.stock_minimo
          ]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return res.status(201).json({
      message: 'Productos inicializados correctamente',
      productos: productosEjemplo
    });
  } catch (error) {
    console.error('Error inicializando productos:', error);
    return res.status(500).json({ error: 'No fue posible inicializar los productos' });
  }
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Producto inválido' });
  }
  try {
    const result = await pool.query(
      `SELECT id, nombre, tipo, precio, stock, stock_minimo, es_retornable, deposito_envase
       FROM productos
       WHERE id = $1 AND empresa_id = $2 AND activo = TRUE`,
      [id, req.user.empresa_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error cargando producto:', error);
    return res.status(500).json({ error: 'No fue posible cargar el producto' });
  }
});

router.post(
  '/',
  checkRole(['admin']),
  ...validateProduct,
  validationHandler,
  async (req, res) => {
    try {
      const { nombre, tipo, precio, stock, stock_minimo } = req.body;
      const isReturnable = req.body.es_retornable === true;
      const containerDeposit = isReturnable ? Number(req.body.deposito_envase || 0) : 0;
      const result = await pool.query(
        `INSERT INTO productos
          (empresa_id, nombre, tipo, precio, stock, stock_minimo, es_retornable, deposito_envase)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, nombre, tipo, precio, stock, stock_minimo, es_retornable, deposito_envase`,
        [req.user.empresa_id, nombre, tipo, precio, stock, stock_minimo, isReturnable, containerDeposit]
      );
      return res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creando producto:', error);
      return res.status(500).json({ error: 'No fue posible crear el producto' });
    }
  }
);

router.put(
  '/:id',
  checkRole(['admin']),
  ...validateProduct,
  validationHandler,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Producto inválido' });
    }
    try {
      const { nombre, tipo, precio, stock, stock_minimo } = req.body;
      const isReturnable = req.body.es_retornable === true;
      const containerDeposit = isReturnable ? Number(req.body.deposito_envase || 0) : 0;
      const result = await pool.query(
        `UPDATE productos
         SET nombre = $1, tipo = $2, precio = $3, stock = $4, stock_minimo = $5,
             es_retornable = $6, deposito_envase = $7
         WHERE id = $8 AND empresa_id = $9 AND activo = TRUE
         RETURNING id, nombre, tipo, precio, stock, stock_minimo, es_retornable, deposito_envase`,
        [nombre, tipo, precio, stock, stock_minimo, isReturnable, containerDeposit, id, req.user.empresa_id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
      return res.json(result.rows[0]);
    } catch (error) {
      console.error('Error actualizando producto:', error);
      return res.status(500).json({ error: 'No fue posible actualizar el producto' });
    }
  }
);

router.delete('/:id', checkRole(['admin']), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Producto inválido' });
  }
  try {
    const result = await pool.query(
      `UPDATE productos SET activo = FALSE
       WHERE id = $1 AND empresa_id = $2 AND activo = TRUE
       RETURNING id`,
      [id, req.user.empresa_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    return res.json({ message: 'Producto archivado' });
  } catch (error) {
    console.error('Error archivando producto:', error);
    return res.status(500).json({ error: 'No fue posible archivar el producto' });
  }
});

module.exports = router;
