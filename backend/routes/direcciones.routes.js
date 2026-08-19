const express = require('express');
const { body, param, validationResult } = require('express-validator');
const pool = require('../config/database');
const { verifyToken, checkRole } = require('../middleware/auth');
const { requireActiveSubscription } = require('../utils/plans');
const logger = require('../utils/logger');

const router = express.Router();

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  return next();
};

const addressValidators = [
  body('etiqueta')
    .trim()
    .isLength({ min: 1, max: 40 }).withMessage('La etiqueta debe tener entre 1 y 40 caracteres')
    .matches(/^[\p{L}\p{M}0-9 .'-]+$/u).withMessage('La etiqueta contiene caracteres no permitidos'),
  body('direccion')
    .trim()
    .isLength({ min: 3, max: 300 }).withMessage('La dirección debe tener entre 3 y 300 caracteres')
    .not().matches(/[<>]/).withMessage('La dirección contiene caracteres no permitidos'),
  body('indicaciones')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 300 }).withMessage('Las indicaciones no pueden superar 300 caracteres')
    .not().matches(/[<>]/).withMessage('Las indicaciones contienen caracteres no permitidos'),
  body('latitud').optional({ nullable: true }).isFloat({ min: -90, max: 90 })
    .withMessage('Latitud inválida').toFloat(),
  body('longitud').optional({ nullable: true }).isFloat({ min: -180, max: 180 })
    .withMessage('Longitud inválida').toFloat(),
  body('es_predeterminada').optional().isBoolean().withMessage('Preferencia inválida').toBoolean(),
  body().custom((value) => {
    const hasLatitude = value.latitud !== null && value.latitud !== undefined && value.latitud !== '';
    const hasLongitude = value.longitud !== null && value.longitud !== undefined && value.longitud !== '';
    if (hasLatitude !== hasLongitude) throw new Error('La ubicación debe incluir latitud y longitud');
    return true;
  }),
  handleValidation
];

router.use(verifyToken, checkRole(['cliente']), requireActiveSubscription);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, etiqueta, direccion, indicaciones, latitud, longitud,
              es_predeterminada, creado_en, actualizado_en
       FROM direcciones_clientes
       WHERE empresa_id = $1 AND cliente_id = $2
       ORDER BY es_predeterminada DESC, creado_en, id`,
      [req.user.empresa_id, req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    logger.error('customer_addresses_read_failed', { error, userId: req.user.id });
    return res.status(500).json({ error: 'No fue posible cargar tus direcciones' });
  }
});

router.post('/', addressValidators, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT id FROM usuarios WHERE id = $1 AND empresa_id = $2 FOR UPDATE',
      [req.user.id, req.user.empresa_id]
    );
    const count = await client.query(
      'SELECT COUNT(*)::INT AS total FROM direcciones_clientes WHERE empresa_id = $1 AND cliente_id = $2',
      [req.user.empresa_id, req.user.id]
    );
    if (count.rows[0].total >= 10) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Puedes guardar hasta 10 direcciones' });
    }
    const makeDefault = Boolean(req.body.es_predeterminada) || count.rows[0].total === 0;
    if (makeDefault) {
      await client.query(
        'UPDATE direcciones_clientes SET es_predeterminada = FALSE WHERE empresa_id = $1 AND cliente_id = $2',
        [req.user.empresa_id, req.user.id]
      );
    }
    const result = await client.query(
      `INSERT INTO direcciones_clientes
        (empresa_id, cliente_id, etiqueta, direccion, indicaciones,
         latitud, longitud, es_predeterminada)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, etiqueta, direccion, indicaciones, latitud, longitud,
                 es_predeterminada, creado_en, actualizado_en`,
      [
        req.user.empresa_id,
        req.user.id,
        req.body.etiqueta,
        req.body.direccion,
        req.body.indicaciones || null,
        req.body.latitud ?? null,
        req.body.longitud ?? null,
        makeDefault
      ]
    );
    await client.query('COMMIT');
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('customer_address_create_failed', { error, userId: req.user.id });
    return res.status(500).json({ error: 'No fue posible guardar la dirección' });
  } finally {
    client.release();
  }
});

router.put(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('Dirección inválida').toInt(),
  ...addressValidators,
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT id FROM usuarios WHERE id = $1 AND empresa_id = $2 FOR UPDATE',
        [req.user.id, req.user.empresa_id]
      );
      const current = await client.query(
        `SELECT id, es_predeterminada
         FROM direcciones_clientes
         WHERE id = $1 AND empresa_id = $2 AND cliente_id = $3
         FOR UPDATE`,
        [req.params.id, req.user.empresa_id, req.user.id]
      );
      if (!current.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Dirección no encontrada' });
      }
      const makeDefault = Boolean(req.body.es_predeterminada) || current.rows[0].es_predeterminada;
      if (makeDefault) {
        await client.query(
          `UPDATE direcciones_clientes SET es_predeterminada = FALSE
           WHERE empresa_id = $1 AND cliente_id = $2 AND id <> $3`,
          [req.user.empresa_id, req.user.id, req.params.id]
        );
      }
      const result = await client.query(
        `UPDATE direcciones_clientes
         SET etiqueta = $1, direccion = $2, indicaciones = $3,
             latitud = $4, longitud = $5, es_predeterminada = $6,
             actualizado_en = CURRENT_TIMESTAMP
         WHERE id = $7 AND empresa_id = $8 AND cliente_id = $9
         RETURNING id, etiqueta, direccion, indicaciones, latitud, longitud,
                   es_predeterminada, creado_en, actualizado_en`,
        [
          req.body.etiqueta,
          req.body.direccion,
          req.body.indicaciones || null,
          req.body.latitud ?? null,
          req.body.longitud ?? null,
          makeDefault,
          req.params.id,
          req.user.empresa_id,
          req.user.id
        ]
      );
      await client.query('COMMIT');
      return res.json(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('customer_address_update_failed', { error, userId: req.user.id });
      return res.status(500).json({ error: 'No fue posible actualizar la dirección' });
    } finally {
      client.release();
    }
  }
);

router.delete(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('Dirección inválida').toInt(),
  handleValidation,
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT id FROM usuarios WHERE id = $1 AND empresa_id = $2 FOR UPDATE',
        [req.user.id, req.user.empresa_id]
      );
      const deleted = await client.query(
        `DELETE FROM direcciones_clientes
         WHERE id = $1 AND empresa_id = $2 AND cliente_id = $3
         RETURNING id, es_predeterminada`,
        [req.params.id, req.user.empresa_id, req.user.id]
      );
      if (!deleted.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Dirección no encontrada' });
      }
      if (deleted.rows[0].es_predeterminada) {
        await client.query(
          `UPDATE direcciones_clientes
           SET es_predeterminada = TRUE, actualizado_en = CURRENT_TIMESTAMP
           WHERE id = (
             SELECT id FROM direcciones_clientes
             WHERE empresa_id = $1 AND cliente_id = $2
             ORDER BY creado_en, id LIMIT 1
           )`,
          [req.user.empresa_id, req.user.id]
        );
      }
      await client.query('COMMIT');
      return res.json({ message: 'Dirección eliminada' });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('customer_address_delete_failed', { error, userId: req.user.id });
      return res.status(500).json({ error: 'No fue posible eliminar la dirección' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
