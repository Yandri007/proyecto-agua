const express = require('express');
const { param, validationResult } = require('express-validator');
const pool = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const { requireActiveSubscription } = require('../utils/plans');
const logger = require('../utils/logger');

const router = express.Router();

router.use(verifyToken, requireActiveSubscription);

router.get('/', async (req, res) => {
  try {
    const [result, unread] = await Promise.all([
      pool.query(
        `SELECT id, tipo, titulo, mensaje, pedido_id, ruta_id, leida, creada_en
         FROM notificaciones
         WHERE empresa_id = $1 AND usuario_id = $2
         ORDER BY creada_en DESC, id DESC
         LIMIT 50`,
        [req.user.empresa_id, req.user.id]
      ),
      pool.query(
        `SELECT COUNT(*)::INT AS total FROM notificaciones
         WHERE empresa_id = $1 AND usuario_id = $2 AND leida = FALSE`,
        [req.user.empresa_id, req.user.id]
      )
    ]);
    return res.json({ notificaciones: result.rows, no_leidas: unread.rows[0].total });
  } catch (error) {
    logger.error('notifications_read_failed', { error, userId: req.user.id });
    return res.status(500).json({ error: 'No fue posible cargar las notificaciones' });
  }
});

router.patch(
  '/:id/leida',
  param('id').isInt({ min: 1 }).withMessage('Notificación inválida').toInt(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    try {
      const result = await pool.query(
        `UPDATE notificaciones
         SET leida = TRUE
         WHERE id = $1 AND empresa_id = $2 AND usuario_id = $3
         RETURNING id`,
        [req.params.id, req.user.empresa_id, req.user.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'Notificación no encontrada' });
      return res.json({ message: 'Notificación leída' });
    } catch (error) {
      logger.error('notification_update_failed', { error, userId: req.user.id });
      return res.status(500).json({ error: 'No fue posible actualizar la notificación' });
    }
  }
);

router.post('/leer-todas', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE notificaciones
       SET leida = TRUE
       WHERE empresa_id = $1 AND usuario_id = $2 AND leida = FALSE`,
      [req.user.empresa_id, req.user.id]
    );
    return res.json({ actualizadas: result.rowCount });
  } catch (error) {
    logger.error('notifications_mark_all_failed', { error, userId: req.user.id });
    return res.status(500).json({ error: 'No fue posible actualizar las notificaciones' });
  }
});

module.exports = router;
