const express = require('express');
const pool = require('../config/database');
const { verifyToken, checkRole } = require('../middleware/auth');
const { requireActiveSubscription } = require('../utils/plans');
const { writeAudit } = require('../utils/audit');
const {
  generateDueRecurringOrders,
  localDate,
  nextScheduledDate
} = require('../utils/recurringOrders');
const logger = require('../utils/logger');

const router = express.Router();
const FREQUENCIES = new Set(['semanal', 'quincenal', 'mensual']);
const PAYMENT_METHODS = new Set(['efectivo', 'transferencia']);

const positiveId = (value) => Number.isInteger(Number(value)) && Number(value) > 0;
const safeText = (value, min, max) => typeof value === 'string'
  && value.trim().length >= min && value.trim().length <= max && !/[<>]/.test(value);
const validDate = (value, maxDays = 365) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00-05:00`);
  const today = new Date(`${localDate()}T12:00:00-05:00`);
  return !Number.isNaN(date.getTime()) && date >= today
    && date.getTime() <= today.getTime() + maxDays * 24 * 60 * 60 * 1000;
};

const parseCoordinates = (latitudeValue, longitudeValue) => {
  const hasCoordinates = latitudeValue !== null && latitudeValue !== undefined
    && longitudeValue !== null && longitudeValue !== undefined;
  if (!hasCoordinates) return { latitude: null, longitude: null };
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
};

const parseItems = (items) => {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) return null;
  const quantities = new Map();
  for (const item of items) {
    const productId = Number(item.producto_id);
    const quantity = Number(item.cantidad);
    if (!positiveId(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return null;
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  return quantities;
};

const validateSchedulePayload = (body) => {
  const frequency = body.frecuencia;
  const firstDate = body.proxima_entrega;
  const address = body.direccion_entrega;
  const paymentMethod = body.metodo_pago || 'efectivo';
  const coordinates = parseCoordinates(body.latitud_entrega, body.longitud_entrega);
  const quantities = parseItems(body.productos);
  if (!FREQUENCIES.has(frequency) || !PAYMENT_METHODS.has(paymentMethod) || !validDate(firstDate, 365)
      || !safeText(address, 3, 300) || !coordinates || !quantities) return null;
  return { frequency, firstDate, address: address.trim(), paymentMethod, coordinates, quantities };
};

const scheduleSelect = `
  SELECT pr.id, pr.empresa_id, pr.cliente_id, pr.frecuencia, pr.proxima_entrega,
         pr.direccion_entrega, pr.latitud_entrega, pr.longitud_entrega, pr.metodo_pago,
         pr.estado, pr.pausado_hasta, pr.ultima_generacion, pr.ultimo_error,
         pr.creado_en, pr.actualizado_en, u.nombre AS cliente_nombre,
         COALESCE((
           SELECT json_agg(json_build_object(
             'producto_id', p.id, 'nombre', p.nombre, 'cantidad', d.cantidad,
             'precio', p.precio, 'activo', p.activo
           ) ORDER BY d.id)
           FROM detalle_pedidos_recurrentes d
           JOIN productos p ON p.id = d.producto_id
           WHERE d.pedido_recurrente_id = pr.id
         ), '[]'::json) AS productos,
         COALESCE((
           SELECT json_agg(exec ORDER BY exec.fecha_programada DESC)
           FROM (
             SELECT epr.fecha_programada, epr.pedido_id, epr.estado, epr.error
             FROM ejecuciones_pedidos_recurrentes epr
             WHERE epr.pedido_recurrente_id = pr.id
             ORDER BY epr.fecha_programada DESC LIMIT 10
           ) exec
         ), '[]'::json) AS ejecuciones
  FROM pedidos_recurrentes pr
  JOIN usuarios u ON u.id = pr.cliente_id`;

router.use(verifyToken, requireActiveSubscription);

router.get('/mis-programaciones', checkRole(['cliente']), async (req, res) => {
  try {
    const result = await pool.query(
      `${scheduleSelect}
       WHERE pr.empresa_id = $1 AND pr.cliente_id = $2
       ORDER BY (pr.estado = 'activo') DESC, pr.proxima_entrega, pr.id DESC`,
      [req.user.empresa_id, req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    logger.error('recurring_orders_customer_read_failed', { error, userId: req.user.id });
    return res.status(500).json({ error: 'No fue posible cargar las entregas programadas' });
  }
});

router.get('/admin/todas', checkRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `${scheduleSelect}
       WHERE pr.empresa_id = $1
       ORDER BY (pr.estado = 'activo') DESC, pr.proxima_entrega, pr.id DESC
       LIMIT 500`,
      [req.user.empresa_id]
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ error: 'No fue posible cargar las entregas programadas' });
  }
});

router.post('/admin/generar', checkRole(['admin']), async (req, res) => {
  const results = await generateDueRecurringOrders({ companyId: req.user.empresa_id });
  const generated = results.filter((item) => item.status === 'generated');
  for (const item of generated) {
    req.app.get('io')?.to(`user:${item.order.cliente_id}`).emit('pedido_actualizado', {
      pedidoId: item.order.id, estado: 'pendiente'
    });
  }
  return res.json({
    procesadas: results.length,
    generadas: generated.length,
    errores: results.filter((item) => item.status === 'error' || item.status === 'failed').length
  });
});

router.post('/', checkRole(['cliente']), async (req, res) => {
  const payload = validateSchedulePayload(req.body);
  const idempotencyKey = typeof req.body.idempotency_key === 'string'
    ? req.body.idempotency_key.trim()
    : '';
  if (!payload || !/^[A-Za-z0-9_-]{10,80}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: 'Programación de entrega inválida' });
  }

  const existingSchedule = await pool.query(
    `SELECT id, frecuencia, proxima_entrega, estado
     FROM pedidos_recurrentes
     WHERE empresa_id = $1 AND cliente_id = $2 AND idempotency_key = $3`,
    [req.user.empresa_id, req.user.id, idempotencyKey]
  );
  if (existingSchedule.rowCount) {
    return res.status(200).json({ ...existingSchedule.rows[0], duplicate: true });
  }

  const activeCount = await pool.query(
    `SELECT COUNT(*)::INT AS total FROM pedidos_recurrentes
     WHERE empresa_id = $1 AND cliente_id = $2 AND estado <> 'cancelado'`,
    [req.user.empresa_id, req.user.id]
  );
  if (activeCount.rows[0].total >= 50) {
    return res.status(409).json({ error: 'Alcanzaste el máximo de programaciones activas' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const productIds = [...payload.quantities.keys()];
    const products = await client.query(
      `SELECT id FROM productos
       WHERE empresa_id = $1 AND activo = TRUE AND id = ANY($2::int[])`,
      [req.user.empresa_id, productIds]
    );
    if (products.rowCount !== productIds.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Uno de los productos no está disponible' });
    }
    const result = await client.query(
      `INSERT INTO pedidos_recurrentes
        (empresa_id, cliente_id, frecuencia, dia_mes, proxima_entrega,
         direccion_entrega, latitud_entrega, longitud_entrega, metodo_pago, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.user.empresa_id, req.user.id, payload.frequency,
        Number(payload.firstDate.slice(8, 10)), payload.firstDate, payload.address,
        payload.coordinates.latitude, payload.coordinates.longitude, payload.paymentMethod, idempotencyKey]
    );
    const schedule = result.rows[0];
    for (const [productId, quantity] of payload.quantities) {
      await client.query(
        `INSERT INTO detalle_pedidos_recurrentes
          (pedido_recurrente_id, producto_id, cantidad) VALUES ($1, $2, $3)`,
        [schedule.id, productId, quantity]
      );
    }
    await writeAudit({ client, req, action: 'pedido_recurrente.creado', entity: 'pedidos_recurrentes', entityId: schedule.id, details: { frecuencia: payload.frequency } });
    await client.query('COMMIT');

    const generated = await generateDueRecurringOrders({ scheduleId: schedule.id, limit: 1 });
    const order = generated.find((item) => item.status === 'generated')?.order || null;
    if (order) {
      req.app.get('io')?.to(`empresa:${req.user.empresa_id}:admins`).emit('pedido_recibido', {
        pedido_id: order.id, cliente: req.user.nombre, total: order.total, recurrente: true
      });
    }
    return res.status(201).json({ ...schedule, pedido_generado: order });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      const existing = await pool.query(
        `SELECT id, frecuencia, proxima_entrega, estado
         FROM pedidos_recurrentes
         WHERE empresa_id = $1 AND cliente_id = $2 AND idempotency_key = $3`,
        [req.user.empresa_id, req.user.id, idempotencyKey]
      );
      if (existing.rowCount) return res.status(200).json({ ...existing.rows[0], duplicate: true });
      return res.status(409).json({ error: 'La programación ya fue registrada' });
    }
    logger.error('recurring_order_creation_failed', { error, userId: req.user.id });
    return res.status(500).json({ error: 'No fue posible crear la programación' });
  } finally {
    client.release();
  }
});

router.put('/:id', checkRole(['cliente']), async (req, res) => {
  const scheduleId = Number(req.params.id);
  const payload = validateSchedulePayload(req.body);
  if (!positiveId(scheduleId) || !payload) {
    return res.status(400).json({ error: 'Programación de entrega inválida' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT id, estado FROM pedidos_recurrentes
       WHERE id = $1 AND empresa_id = $2 AND cliente_id = $3 FOR UPDATE`,
      [scheduleId, req.user.empresa_id, req.user.id]
    );
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Programación no encontrada' });
    }
    if (current.rows[0].estado === 'cancelado') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Una programación cancelada no puede editarse' });
    }
    const productIds = [...payload.quantities.keys()];
    const products = await client.query(
      `SELECT id FROM productos WHERE empresa_id = $1 AND activo = TRUE AND id = ANY($2::int[])`,
      [req.user.empresa_id, productIds]
    );
    if (products.rowCount !== productIds.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Uno de los productos no está disponible' });
    }
    await client.query(
      `UPDATE pedidos_recurrentes SET frecuencia = $1, dia_mes = $2,
              proxima_entrega = $3, direccion_entrega = $4,
              latitud_entrega = $5, longitud_entrega = $6,
              metodo_pago = $7, ultimo_error = NULL, actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $8`,
      [payload.frequency, Number(payload.firstDate.slice(8, 10)), payload.firstDate,
        payload.address, payload.coordinates.latitude, payload.coordinates.longitude,
        payload.paymentMethod, scheduleId]
    );
    await client.query('DELETE FROM detalle_pedidos_recurrentes WHERE pedido_recurrente_id = $1', [scheduleId]);
    for (const [productId, quantity] of payload.quantities) {
      await client.query(
        `INSERT INTO detalle_pedidos_recurrentes
          (pedido_recurrente_id, producto_id, cantidad) VALUES ($1, $2, $3)`,
        [scheduleId, productId, quantity]
      );
    }
    await writeAudit({ client, req, action: 'pedido_recurrente.actualizado', entity: 'pedidos_recurrentes', entityId: scheduleId });
    await client.query('COMMIT');
    const generated = current.rows[0].estado === 'activo'
      ? await generateDueRecurringOrders({ scheduleId, limit: 1 })
      : [];
    return res.json({ id: scheduleId, pedido_generado: generated.find((item) => item.status === 'generated')?.order || null });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'No fue posible actualizar la programación' });
  } finally {
    client.release();
  }
});

router.put('/:id/estado', checkRole(['cliente', 'admin']), async (req, res) => {
  const scheduleId = Number(req.params.id);
  const action = req.body.accion;
  if (!positiveId(scheduleId) || !['pausar', 'reanudar', 'omitir', 'cancelar'].includes(action)) {
    return res.status(400).json({ error: 'Acción inválida' });
  }
  const resumeDate = req.body.proxima_entrega;
  const pauseUntil = req.body.pausado_hasta || null;
  if (action === 'reanudar' && !validDate(resumeDate, 365)) {
    return res.status(400).json({ error: 'Selecciona la próxima fecha de entrega' });
  }
  if (action === 'pausar' && pauseUntil && !validDate(pauseUntil, 365)) {
    return res.status(400).json({ error: 'Fecha de pausa inválida' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT * FROM pedidos_recurrentes
       WHERE id = $1 AND empresa_id = $2
         AND ($4::boolean OR cliente_id = $3)
       FOR UPDATE`,
      [scheduleId, req.user.empresa_id, req.user.id, req.user.rol === 'admin']
    );
    const schedule = result.rows[0];
    if (!schedule) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Programación no encontrada' });
    }
    if (schedule.estado === 'cancelado') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La programación ya fue cancelada' });
    }

    if (action === 'omitir') {
      if (schedule.estado !== 'activo') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Solo puedes omitir una programación activa' });
      }
      const nextDate = nextScheduledDate(schedule.proxima_entrega, schedule.frecuencia, Number(schedule.dia_mes));
      await client.query(
        `INSERT INTO ejecuciones_pedidos_recurrentes
          (pedido_recurrente_id, fecha_programada, estado)
         VALUES ($1, $2, 'omitido')
         ON CONFLICT (pedido_recurrente_id, fecha_programada) DO NOTHING`,
        [schedule.id, schedule.proxima_entrega]
      );
      await client.query(
        `UPDATE pedidos_recurrentes SET proxima_entrega = $1,
                ultimo_error = NULL, actualizado_en = CURRENT_TIMESTAMP WHERE id = $2`,
        [nextDate, schedule.id]
      );
    } else if (action === 'pausar') {
      await client.query(
        `UPDATE pedidos_recurrentes SET estado = 'pausado', pausado_hasta = $1,
                actualizado_en = CURRENT_TIMESTAMP WHERE id = $2`,
        [pauseUntil, schedule.id]
      );
    } else if (action === 'reanudar') {
      await client.query(
        `UPDATE pedidos_recurrentes SET estado = 'activo', pausado_hasta = NULL,
                proxima_entrega = $1, ultimo_error = NULL,
                actualizado_en = CURRENT_TIMESTAMP WHERE id = $2`,
        [resumeDate, schedule.id]
      );
    } else {
      await client.query(
        `UPDATE pedidos_recurrentes SET estado = 'cancelado', pausado_hasta = NULL,
                actualizado_en = CURRENT_TIMESTAMP WHERE id = $1`,
        [schedule.id]
      );
    }
    await writeAudit({ client, req, action: `pedido_recurrente.${action}`, entity: 'pedidos_recurrentes', entityId: schedule.id });
    await client.query('COMMIT');
    const generated = action === 'reanudar'
      ? await generateDueRecurringOrders({ scheduleId: schedule.id, limit: 1 })
      : [];
    const order = generated.find((item) => item.status === 'generated')?.order || null;
    if (order) {
      req.app.get('io')?.to(`empresa:${req.user.empresa_id}:admins`).emit('pedido_recibido', {
        pedido_id: order.id, cliente: req.user.nombre, total: order.total, recurrente: true
      });
    }
    return res.json({ id: schedule.id, accion: action, pedido_generado: order });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('recurring_order_state_failed', { error, scheduleId, action });
    return res.status(500).json({ error: 'No fue posible cambiar la programación' });
  } finally {
    client.release();
  }
});

module.exports = router;
