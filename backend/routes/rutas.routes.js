const express = require('express');
const pool = require('../config/database');
const { verifyToken, checkRole } = require('../middleware/auth');
const { requireActiveSubscription } = require('../utils/plans');
const { createNotification, emitNotifications } = require('../utils/notifications');
const logger = require('../utils/logger');

const router = express.Router();

const INCIDENT_LABELS = Object.freeze({
  cliente_ausente: 'Cliente ausente',
  direccion_incorrecta: 'Dirección incorrecta',
  sin_respuesta: 'Cliente sin respuesta',
  pago_pendiente: 'Pago pendiente',
  acceso_restringido: 'Acceso restringido',
  otro: 'Otra incidencia'
});

const todayEcuador = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const dateWithinDays = (value, minDays, maxDays) => {
  if (!validDate(value)) return false;
  const base = new Date(`${todayEcuador()}T12:00:00Z`);
  const target = new Date(`${value}T12:00:00Z`);
  const difference = Math.round((target - base) / 86400000);
  return difference >= minDays && difference <= maxDays;
};

const databaseDate = (value) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
};

const positiveIds = (values, max = 100) => (
  Array.isArray(values)
  && values.length > 0
  && values.length <= max
  && values.every((value) => Number.isInteger(Number(value)) && Number(value) > 0)
  && new Set(values.map(Number)).size === values.length
);

const loadRoutes = async (client, empresaId, { date = null, routeId = null, driverId = null } = {}) => {
  const result = await client.query(
    `SELECT r.id, r.fecha, r.nombre, r.repartidor_id, r.estado,
            r.iniciada_en, r.completada_en, r.creada_en, r.actualizada_en,
            u.nombre AS repartidor_nombre,
            COALESCE((
              SELECT json_agg(stop ORDER BY stop.orden)
              FROM (
                SELECT pr.id, pr.pedido_id, pr.orden, pr.estado,
                       pr.incidencia_codigo, pr.incidencia_detalle,
                       pr.iniciada_en, pr.completada_en, pr.incidencia_en,
                       p.cliente_id, p.direccion_entrega, p.indicaciones_entrega,
                       p.latitud_entrega, p.longitud_entrega, p.total,
                       p.metodo_pago, p.fecha_programada, p.estado AS pedido_estado,
                       cli.nombre AS cliente_nombre, cli.telefono AS cliente_telefono
                FROM paradas_ruta pr
                JOIN pedidos p ON p.id = pr.pedido_id AND p.empresa_id = pr.empresa_id
                JOIN usuarios cli ON cli.id = p.cliente_id AND cli.empresa_id = p.empresa_id
                WHERE pr.ruta_id = r.id AND pr.empresa_id = r.empresa_id
              ) stop
            ), '[]'::json) AS paradas
     FROM rutas_entrega r
     JOIN usuarios u ON u.id = r.repartidor_id AND u.empresa_id = r.empresa_id
     WHERE r.empresa_id = $1
       AND ($2::date IS NULL OR r.fecha = $2::date)
       AND ($3::bigint IS NULL OR r.id = $3::bigint)
       AND ($4::int IS NULL OR r.repartidor_id = $4::int)
     ORDER BY r.fecha DESC, r.creada_en DESC`,
    [empresaId, date, routeId, driverId]
  );
  return result.rows;
};

const finishRouteWhenDone = async (client, empresaId, routeId) => {
  await client.query(
    `UPDATE rutas_entrega r
     SET estado = 'completada', completada_en = CURRENT_TIMESTAMP,
         actualizada_en = CURRENT_TIMESTAMP
     WHERE r.id = $1 AND r.empresa_id = $2
       AND r.estado IN ('planificada', 'en_curso')
       AND NOT EXISTS (
         SELECT 1 FROM paradas_ruta pr
         WHERE pr.ruta_id = r.id AND pr.estado IN ('pendiente', 'en_camino')
       )`,
    [routeId, empresaId]
  );
};

router.use(verifyToken, requireActiveSubscription);

router.get('/disponibles', checkRole(['admin']), async (req, res) => {
  const date = req.query.fecha || todayEcuador();
  const driverId = req.query.repartidor_id === undefined || req.query.repartidor_id === ''
    ? null
    : Number(req.query.repartidor_id);
  if (!validDate(date)) return res.status(400).json({ error: 'Fecha inválida' });
  if (driverId !== null && (!Number.isInteger(driverId) || driverId <= 0)) {
    return res.status(400).json({ error: 'Repartidor inválido' });
  }
  try {
    const result = await pool.query(
      `SELECT p.id, p.cliente_id, p.estado, p.repartidor_id, p.total, p.metodo_pago, p.direccion_entrega,
              p.indicaciones_entrega, p.latitud_entrega, p.longitud_entrega,
              p.fecha_programada, p.created_at, u.nombre AS cliente_nombre
       FROM pedidos p
       JOIN usuarios u ON u.id = p.cliente_id AND u.empresa_id = p.empresa_id
       WHERE p.empresa_id = $1
         AND (p.estado = 'pendiente' OR (p.estado = 'asignado' AND p.repartidor_id = $3))
         AND (p.fecha_programada IS NULL OR p.fecha_programada <= $2::date)
         AND NOT EXISTS (
           SELECT 1 FROM paradas_ruta pr
           WHERE pr.pedido_id = p.id AND pr.estado IN ('pendiente', 'en_camino')
         )
       ORDER BY COALESCE(p.fecha_programada, p.created_at::date), p.created_at, p.id
       LIMIT 200`,
      [req.user.empresa_id, date, driverId]
    );
    return res.json(result.rows);
  } catch (error) {
    logger.error('available_route_orders_failed', { error, empresaId: req.user.empresa_id });
    return res.status(500).json({ error: 'No fue posible cargar los pedidos disponibles' });
  }
});

router.get('/', checkRole(['admin']), async (req, res) => {
  const date = req.query.fecha || todayEcuador();
  if (!validDate(date)) return res.status(400).json({ error: 'Fecha inválida' });
  try {
    return res.json(await loadRoutes(pool, req.user.empresa_id, { date }));
  } catch (error) {
    logger.error('routes_read_failed', { error, empresaId: req.user.empresa_id });
    return res.status(500).json({ error: 'No fue posible cargar las rutas' });
  }
});

router.get('/mi-ruta', checkRole(['repartidor']), async (req, res) => {
  const date = req.query.fecha || todayEcuador();
  if (!validDate(date)) return res.status(400).json({ error: 'Fecha inválida' });
  try {
    const rows = await loadRoutes(pool, req.user.empresa_id, {
      date,
      driverId: req.user.id
    });
    return res.json({ ruta: rows.find((item) => item.estado !== 'cancelada') || rows[0] || null });
  } catch (error) {
    logger.error('driver_route_read_failed', { error, userId: req.user.id });
    return res.status(500).json({ error: 'No fue posible cargar tu ruta' });
  }
});

router.post('/', checkRole(['admin']), async (req, res) => {
  const name = String(req.body.nombre || '').trim();
  const date = String(req.body.fecha || '');
  const driverId = Number(req.body.repartidor_id);
  const orderIds = Array.isArray(req.body.pedido_ids) ? req.body.pedido_ids.map(Number) : [];
  if (name.length < 3 || name.length > 100 || /[<>]/.test(name)) {
    return res.status(400).json({ error: 'El nombre de la ruta debe tener entre 3 y 100 caracteres' });
  }
  if (!dateWithinDays(date, 0, 90)) {
    return res.status(400).json({ error: 'La ruta debe programarse entre hoy y los próximos 90 días' });
  }
  if (!Number.isInteger(driverId) || driverId <= 0 || !positiveIds(orderIds)) {
    return res.status(400).json({ error: 'Repartidor o pedidos inválidos' });
  }

  const client = await pool.connect();
  const notifications = [];
  try {
    await client.query('BEGIN');
    const driver = await client.query(
      `SELECT id, nombre FROM usuarios
       WHERE id = $1 AND empresa_id = $2 AND rol = 'repartidor' AND estado = 'activo'
       FOR UPDATE`,
      [driverId, req.user.empresa_id]
    );
    if (!driver.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Repartidor no disponible' });
    }
    const orders = await client.query(
      `SELECT p.id, p.cliente_id, p.estado, p.repartidor_id, p.fecha_programada,
              u.nombre AS cliente_nombre,
              EXISTS (
                SELECT 1 FROM paradas_ruta pr
                WHERE pr.pedido_id = p.id AND pr.empresa_id = p.empresa_id
                  AND pr.estado IN ('pendiente', 'en_camino')
              ) AS tiene_parada_activa
       FROM pedidos p
       JOIN usuarios u ON u.id = p.cliente_id AND u.empresa_id = p.empresa_id
       WHERE p.empresa_id = $1 AND p.id = ANY($2::int[])
       FOR UPDATE OF p`,
      [req.user.empresa_id, orderIds]
    );
    const orderById = new Map(orders.rows.map((item) => [Number(item.id), item]));
    const unavailable = orderIds.some((id) => {
      const order = orderById.get(id);
      const canUsePendingOrder = order?.estado === 'pendiente';
      const alreadyAssignedToDriver = order?.estado === 'asignado'
        && Number(order.repartidor_id) === driverId;
      return !order || (!canUsePendingOrder && !alreadyAssignedToDriver)
        || order.tiene_parada_activa
        || (order.fecha_programada && databaseDate(order.fecha_programada) > date);
    });
    if (unavailable || orders.rowCount !== orderIds.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Uno de los pedidos ya no está disponible para esta ruta' });
    }

    const route = await client.query(
      `INSERT INTO rutas_entrega
        (empresa_id, fecha, nombre, repartidor_id, creada_por)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [req.user.empresa_id, date, name, driverId, req.user.id]
    );
    const routeId = Number(route.rows[0].id);
    for (let index = 0; index < orderIds.length; index += 1) {
      await client.query(
        `INSERT INTO paradas_ruta (empresa_id, ruta_id, pedido_id, orden)
         VALUES ($1, $2, $3, $4)`,
        [req.user.empresa_id, routeId, orderIds[index], index + 1]
      );
    }
    await client.query(
      `UPDATE pedidos
       SET repartidor_id = $1, estado = 'asignado', actualizado_en = CURRENT_TIMESTAMP
       WHERE empresa_id = $2 AND id = ANY($3::int[])`,
      [driverId, req.user.empresa_id, orderIds]
    );

    notifications.push(await createNotification({
      client,
      empresaId: req.user.empresa_id,
      userId: driverId,
      type: 'ruta_asignada',
      title: 'Nueva ruta asignada',
      message: `${name} tiene ${orderIds.length} parada${orderIds.length === 1 ? '' : 's'} para ${date}.`,
      routeId,
      eventKey: `route-assigned-${routeId}`
    }));
    for (const orderId of orderIds) {
      const order = orderById.get(orderId);
      notifications.push(await createNotification({
        client,
        empresaId: req.user.empresa_id,
        userId: order.cliente_id,
        type: 'entrega_programada',
        title: 'Entrega asignada',
        message: `Tu pedido #${orderId} fue incluido en la ruta del ${date}.`,
        orderId,
        routeId,
        eventKey: `route-order-assigned-${routeId}-${orderId}`
      }));
    }
    await client.query('COMMIT');
    emitNotifications(req.app.get('io'), notifications);
    req.app.get('io')?.to(`user:${driverId}`).emit('ruta_actualizada', { rutaId: routeId });
    req.app.get('io')?.to(`empresa:${req.user.empresa_id}:admins`).emit('ruta_actualizada', { rutaId: routeId });
    const created = await loadRoutes(pool, req.user.empresa_id, { routeId });
    return res.status(201).json(created[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ error: 'El repartidor ya tiene una ruta activa para esa fecha o un pedido ya fue asignado' });
    }
    logger.error('route_create_failed', { error, empresaId: req.user.empresa_id });
    return res.status(500).json({ error: 'No fue posible crear la ruta' });
  } finally {
    client.release();
  }
});

router.put('/:id/orden', checkRole(['admin']), async (req, res) => {
  const routeId = Number(req.params.id);
  const stopIds = Array.isArray(req.body.parada_ids) ? req.body.parada_ids.map(Number) : [];
  if (!Number.isInteger(routeId) || routeId <= 0 || !positiveIds(stopIds)) {
    return res.status(400).json({ error: 'Ruta u orden inválido' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const route = await client.query(
      `SELECT id FROM rutas_entrega
       WHERE id = $1 AND empresa_id = $2 AND estado = 'planificada'
       FOR UPDATE`,
      [routeId, req.user.empresa_id]
    );
    if (!route.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Solo se puede ordenar una ruta planificada' });
    }
    const stops = await client.query(
      `SELECT id FROM paradas_ruta
       WHERE ruta_id = $1 AND empresa_id = $2 AND estado = 'pendiente'
       FOR UPDATE`,
      [routeId, req.user.empresa_id]
    );
    const current = new Set(stops.rows.map((item) => Number(item.id)));
    if (current.size !== stopIds.length || stopIds.some((id) => !current.has(id))) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El orden no contiene todas las paradas activas' });
    }
    await client.query(
      `UPDATE paradas_ruta SET orden = orden + 1000
       WHERE ruta_id = $1 AND empresa_id = $2`,
      [routeId, req.user.empresa_id]
    );
    for (let index = 0; index < stopIds.length; index += 1) {
      await client.query(
        `UPDATE paradas_ruta SET orden = $1, actualizada_en = CURRENT_TIMESTAMP
         WHERE id = $2 AND ruta_id = $3 AND empresa_id = $4`,
        [index + 1, stopIds[index], routeId, req.user.empresa_id]
      );
    }
    await client.query(
      `UPDATE rutas_entrega SET actualizada_en = CURRENT_TIMESTAMP
       WHERE id = $1 AND empresa_id = $2`,
      [routeId, req.user.empresa_id]
    );
    await client.query('COMMIT');
    req.app.get('io')?.to(`empresa:${req.user.empresa_id}`).emit('ruta_actualizada', { rutaId: routeId });
    return res.json({ message: 'Orden actualizado' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('route_reorder_failed', { error, routeId });
    return res.status(500).json({ error: 'No fue posible actualizar el orden' });
  } finally {
    client.release();
  }
});

router.post('/:id/iniciar', checkRole(['repartidor']), async (req, res) => {
  const routeId = Number(req.params.id);
  if (!Number.isInteger(routeId) || routeId <= 0) return res.status(400).json({ error: 'Ruta inválida' });
  const client = await pool.connect();
  const notifications = [];
  try {
    await client.query('BEGIN');
    const route = await client.query(
      `SELECT id, nombre, fecha FROM rutas_entrega
       WHERE id = $1 AND empresa_id = $2 AND repartidor_id = $3 AND estado = 'planificada'
       FOR UPDATE`,
      [routeId, req.user.empresa_id, req.user.id]
    );
    if (!route.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La ruta no está disponible para iniciar' });
    }
    if (databaseDate(route.rows[0].fecha) > todayEcuador()) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La ruta todavía no corresponde a la jornada actual' });
    }
    const customers = await client.query(
      `SELECT p.id AS pedido_id, p.cliente_id
       FROM paradas_ruta pr
       JOIN pedidos p ON p.id = pr.pedido_id AND p.empresa_id = pr.empresa_id
       WHERE pr.ruta_id = $1 AND pr.empresa_id = $2 AND pr.estado = 'pendiente'`,
      [routeId, req.user.empresa_id]
    );
    if (!customers.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La ruta no tiene paradas pendientes' });
    }
    await client.query(
      `UPDATE rutas_entrega
       SET estado = 'en_curso', iniciada_en = CURRENT_TIMESTAMP, actualizada_en = CURRENT_TIMESTAMP
       WHERE id = $1 AND empresa_id = $2`,
      [routeId, req.user.empresa_id]
    );
    for (const customer of customers.rows) {
      notifications.push(await createNotification({
        client,
        empresaId: req.user.empresa_id,
        userId: customer.cliente_id,
        type: 'ruta_iniciada',
        title: 'Ruta de reparto iniciada',
        message: `Tu pedido #${customer.pedido_id} está programado en la jornada de hoy.`,
        orderId: customer.pedido_id,
        routeId,
        eventKey: `route-started-${routeId}-${customer.pedido_id}`
      }));
    }
    await client.query('COMMIT');
    emitNotifications(req.app.get('io'), notifications);
    req.app.get('io')?.to(`empresa:${req.user.empresa_id}:admins`).emit('ruta_actualizada', { rutaId: routeId });
    return res.json({ message: 'Ruta iniciada', estado: 'en_curso' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('route_start_failed', { error, routeId, userId: req.user.id });
    return res.status(500).json({ error: 'No fue posible iniciar la ruta' });
  } finally {
    client.release();
  }
});

router.post('/paradas/:id/en-camino', checkRole(['repartidor']), async (req, res) => {
  const stopId = Number(req.params.id);
  if (!Number.isInteger(stopId) || stopId <= 0) return res.status(400).json({ error: 'Parada inválida' });
  const client = await pool.connect();
  let notification = null;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT pr.id, pr.ruta_id, pr.pedido_id, pr.estado,
              r.estado AS ruta_estado, r.repartidor_id,
              p.cliente_id, p.estado AS pedido_estado
       FROM paradas_ruta pr
       JOIN rutas_entrega r ON r.id = pr.ruta_id AND r.empresa_id = pr.empresa_id
       JOIN pedidos p ON p.id = pr.pedido_id AND p.empresa_id = pr.empresa_id
       WHERE pr.id = $1 AND pr.empresa_id = $2
       FOR UPDATE OF pr, r, p`,
      [stopId, req.user.empresa_id]
    );
    const stop = result.rows[0];
    if (!stop || Number(stop.repartidor_id) !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Parada no encontrada' });
    }
    if (stop.ruta_estado !== 'en_curso' || !['pendiente', 'en_camino'].includes(stop.estado)
        || !['asignado', 'en_camino'].includes(stop.pedido_estado)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La parada no está disponible; inicia primero la ruta' });
    }
    const another = await client.query(
      `SELECT id FROM paradas_ruta
       WHERE ruta_id = $1 AND estado = 'en_camino' AND id <> $2
       LIMIT 1`,
      [stop.ruta_id, stopId]
    );
    if (another.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Finaliza o registra la incidencia de la parada actual' });
    }
    const firstTransition = stop.estado === 'pendiente';
    await client.query(
      `UPDATE paradas_ruta
       SET estado = 'en_camino', iniciada_en = COALESCE(iniciada_en, CURRENT_TIMESTAMP),
           actualizada_en = CURRENT_TIMESTAMP
       WHERE id = $1 AND empresa_id = $2`,
      [stopId, req.user.empresa_id]
    );
    await client.query(
      `UPDATE pedidos SET estado = 'en_camino', actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $1 AND empresa_id = $2`,
      [stop.pedido_id, req.user.empresa_id]
    );
    if (firstTransition) {
      notification = await createNotification({
        client,
        empresaId: req.user.empresa_id,
        userId: stop.cliente_id,
        type: 'repartidor_en_camino',
        title: 'Tu repartidor va en camino',
        message: `La entrega del pedido #${stop.pedido_id} es la parada activa del repartidor.`,
        orderId: stop.pedido_id,
        routeId: stop.ruta_id,
        eventKey: `order-on-way-${stop.pedido_id}`
      });
    }
    await client.query('COMMIT');
    emitNotifications(req.app.get('io'), [notification]);
    req.app.get('io')?.to(`user:${stop.cliente_id}`).emit('pedido_actualizado', {
      pedidoId: stop.pedido_id,
      estado: 'en_camino'
    });
    req.app.get('io')?.to(`empresa:${req.user.empresa_id}:admins`).emit('ruta_actualizada', {
      rutaId: stop.ruta_id,
      paradaId: stopId
    });
    return res.json({ message: 'Parada activa', pedido_id: stop.pedido_id, estado: 'en_camino' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('route_stop_start_failed', { error, stopId, userId: req.user.id });
    return res.status(500).json({ error: 'No fue posible iniciar la parada' });
  } finally {
    client.release();
  }
});

router.post('/paradas/:id/incidencia', checkRole(['repartidor']), async (req, res) => {
  const stopId = Number(req.params.id);
  const code = String(req.body.codigo || '');
  const detail = String(req.body.detalle || '').trim();
  const rescheduleDate = req.body.reprogramar_para ? String(req.body.reprogramar_para) : null;
  if (!Number.isInteger(stopId) || stopId <= 0 || !INCIDENT_LABELS[code]) {
    return res.status(400).json({ error: 'Parada o tipo de incidencia inválido' });
  }
  if (detail.length > 300 || /[<>]/.test(detail) || (code === 'otro' && detail.length < 3)) {
    return res.status(400).json({ error: 'Describe la incidencia con un texto válido' });
  }
  if (rescheduleDate && !dateWithinDays(rescheduleDate, 1, 90)) {
    return res.status(400).json({ error: 'La reprogramación debe estar entre mañana y los próximos 90 días' });
  }
  const client = await pool.connect();
  let notification = null;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT pr.id, pr.ruta_id, pr.pedido_id, pr.estado,
              r.estado AS ruta_estado, r.repartidor_id,
              p.cliente_id, p.estado AS pedido_estado
       FROM paradas_ruta pr
       JOIN rutas_entrega r ON r.id = pr.ruta_id AND r.empresa_id = pr.empresa_id
       JOIN pedidos p ON p.id = pr.pedido_id AND p.empresa_id = pr.empresa_id
       WHERE pr.id = $1 AND pr.empresa_id = $2
       FOR UPDATE OF pr, r, p`,
      [stopId, req.user.empresa_id]
    );
    const stop = result.rows[0];
    if (!stop || Number(stop.repartidor_id) !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Parada no encontrada' });
    }
    if (stop.ruta_estado !== 'en_curso' || stop.estado !== 'en_camino'
        || stop.pedido_estado !== 'en_camino') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Activa esta parada antes de registrar una incidencia' });
    }
    await client.query(
      `UPDATE paradas_ruta
       SET estado = 'incidencia', incidencia_codigo = $1, incidencia_detalle = $2,
           incidencia_en = CURRENT_TIMESTAMP, completada_en = CURRENT_TIMESTAMP,
           actualizada_en = CURRENT_TIMESTAMP
       WHERE id = $3 AND empresa_id = $4`,
      [code, detail || null, stopId, req.user.empresa_id]
    );
    await client.query(
      `UPDATE pedidos
       SET estado = 'pendiente', repartidor_id = NULL,
           fecha_programada = COALESCE($1::date, fecha_programada),
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $2 AND empresa_id = $3`,
      [rescheduleDate, stop.pedido_id, req.user.empresa_id]
    );
    await client.query(
      'DELETE FROM ubicaciones_repartidores WHERE pedido_id = $1 AND empresa_id = $2',
      [stop.pedido_id, req.user.empresa_id]
    );
    await finishRouteWhenDone(client, req.user.empresa_id, stop.ruta_id);
    const scheduleText = rescheduleDate ? ` Se reprogramó para ${rescheduleDate}.` : '';
    notification = await createNotification({
      client,
      empresaId: req.user.empresa_id,
      userId: stop.cliente_id,
      type: 'incidencia_entrega',
      title: 'No se pudo completar la entrega',
      message: `${INCIDENT_LABELS[code]} en el pedido #${stop.pedido_id}.${scheduleText}`,
      orderId: stop.pedido_id,
      routeId: stop.ruta_id,
      eventKey: `stop-incident-${stopId}`
    });
    await client.query('COMMIT');
    emitNotifications(req.app.get('io'), [notification]);
    req.app.get('io')?.to(`user:${stop.cliente_id}`).emit('pedido_actualizado', {
      pedidoId: stop.pedido_id,
      estado: 'pendiente'
    });
    req.app.get('io')?.to(`empresa:${req.user.empresa_id}:admins`).emit('ruta_actualizada', {
      rutaId: stop.ruta_id,
      paradaId: stopId,
      incidencia: code
    });
    return res.json({
      message: 'Incidencia registrada',
      pedido_id: stop.pedido_id,
      estado: 'incidencia'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('route_incident_failed', { error, stopId, userId: req.user.id });
    return res.status(500).json({ error: 'No fue posible registrar la incidencia' });
  } finally {
    client.release();
  }
});

router.post('/:id/cancelar', checkRole(['admin']), async (req, res) => {
  const routeId = Number(req.params.id);
  if (!Number.isInteger(routeId) || routeId <= 0) return res.status(400).json({ error: 'Ruta inválida' });
  const client = await pool.connect();
  const notifications = [];
  try {
    await client.query('BEGIN');
    const route = await client.query(
      `SELECT id, nombre, repartidor_id, estado FROM rutas_entrega
       WHERE id = $1 AND empresa_id = $2
       FOR UPDATE`,
      [routeId, req.user.empresa_id]
    );
    if (!route.rowCount || !['planificada', 'en_curso'].includes(route.rows[0].estado)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La ruta ya no se puede cancelar' });
    }
    const activeStops = await client.query(
      `SELECT pr.id, pr.pedido_id, p.cliente_id
       FROM paradas_ruta pr
       JOIN pedidos p ON p.id = pr.pedido_id AND p.empresa_id = pr.empresa_id
       WHERE pr.ruta_id = $1 AND pr.empresa_id = $2
         AND pr.estado IN ('pendiente', 'en_camino')
       FOR UPDATE OF pr, p`,
      [routeId, req.user.empresa_id]
    );
    const orderIds = activeStops.rows.map((item) => Number(item.pedido_id));
    await client.query(
      `UPDATE paradas_ruta
       SET estado = 'cancelada', completada_en = CURRENT_TIMESTAMP,
           actualizada_en = CURRENT_TIMESTAMP
       WHERE ruta_id = $1 AND empresa_id = $2 AND estado IN ('pendiente', 'en_camino')`,
      [routeId, req.user.empresa_id]
    );
    if (orderIds.length) {
      await client.query(
        `UPDATE pedidos SET estado = 'pendiente', repartidor_id = NULL,
             actualizado_en = CURRENT_TIMESTAMP
         WHERE empresa_id = $1 AND id = ANY($2::int[]) AND estado IN ('asignado', 'en_camino')`,
        [req.user.empresa_id, orderIds]
      );
      await client.query(
        `DELETE FROM ubicaciones_repartidores
         WHERE empresa_id = $1 AND pedido_id = ANY($2::int[])`,
        [req.user.empresa_id, orderIds]
      );
    }
    await client.query(
      `UPDATE rutas_entrega
       SET estado = 'cancelada', completada_en = CURRENT_TIMESTAMP,
           actualizada_en = CURRENT_TIMESTAMP
       WHERE id = $1 AND empresa_id = $2`,
      [routeId, req.user.empresa_id]
    );
    notifications.push(await createNotification({
      client,
      empresaId: req.user.empresa_id,
      userId: route.rows[0].repartidor_id,
      type: 'ruta_cancelada',
      title: 'Ruta cancelada',
      message: `La ruta ${route.rows[0].nombre} fue cancelada por administración.`,
      routeId,
      eventKey: `route-cancelled-${routeId}`
    }));
    for (const stop of activeStops.rows) {
      notifications.push(await createNotification({
        client,
        empresaId: req.user.empresa_id,
        userId: stop.cliente_id,
        type: 'entrega_reprogramable',
        title: 'Entrega pendiente de nueva ruta',
        message: `El pedido #${stop.pedido_id} volverá a ser programado.`,
        orderId: stop.pedido_id,
        routeId,
        eventKey: `route-cancelled-order-${routeId}-${stop.pedido_id}`
      }));
    }
    await client.query('COMMIT');
    emitNotifications(req.app.get('io'), notifications);
    req.app.get('io')?.to(`empresa:${req.user.empresa_id}`).emit('ruta_actualizada', { rutaId: routeId });
    return res.json({ message: 'Ruta cancelada', pedidos_liberados: orderIds.length });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('route_cancel_failed', { error, routeId });
    return res.status(500).json({ error: 'No fue posible cancelar la ruta' });
  } finally {
    client.release();
  }
});

module.exports = router;
