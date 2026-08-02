const express = require('express');
const pool = require('../config/database');
const { verifyToken, checkRole } = require('../middleware/auth');
const { requireActiveSubscription } = require('../utils/plans');
const { requireModule } = require('../utils/modules');
const { writeAudit } = require('../utils/audit');
const logger = require('../utils/logger');

const router = express.Router();
const VEHICLE_STATES = new Set(['activo', 'mantenimiento', 'inactivo']);
const REVIEW_STATES = new Set(['aprobar', 'observar']);

const positiveId = (value) => Number.isInteger(Number(value)) && Number(value) > 0;
const cleanText = (value, max, required = false) => {
  if (value === undefined || value === null || value === '') return required ? undefined : null;
  if (typeof value !== 'string' || value.trim().length > max || /[<>]/.test(value)) return undefined;
  const cleaned = value.trim();
  if (required && cleaned.length < 2) return undefined;
  return cleaned;
};
const localDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

router.use(verifyToken, requireActiveSubscription);

router.get('/vehiculos', checkRole(['admin']), requireModule('logistica'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.id, v.placa, v.nombre, v.estado, v.repartidor_id,
              u.nombre AS repartidor_nombre, v.actualizado_en,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'producto_id', p.id, 'nombre', p.nombre, 'cantidad', iv.cantidad
                ) ORDER BY p.nombre)
                FROM inventario_vehiculos iv
                JOIN productos p ON p.id = iv.producto_id
                WHERE iv.vehiculo_id = v.id AND iv.cantidad > 0
              ), '[]'::json) AS inventario
       FROM vehiculos v
       LEFT JOIN usuarios u ON u.id = v.repartidor_id
       WHERE v.empresa_id = $1
       ORDER BY (v.estado = 'activo') DESC, v.nombre`,
      [req.user.empresa_id]
    );
    return res.json(result.rows);
  } catch (error) {
    logger.error('vehicles_read_failed', { error, companyId: req.user.empresa_id });
    return res.status(500).json({ error: 'No fue posible cargar los vehículos' });
  }
});

router.post('/vehiculos', checkRole(['admin']), requireModule('logistica'), async (req, res) => {
  const plate = cleanText(req.body.placa, 16, true)?.toUpperCase();
  const name = cleanText(req.body.nombre, 80, true);
  const driverId = req.body.repartidor_id ? Number(req.body.repartidor_id) : null;
  if (!plate || !/^[A-Z0-9-]{3,16}$/.test(plate) || !name || (driverId && !positiveId(driverId))) {
    return res.status(400).json({ error: 'Datos del vehículo inválidos' });
  }
  try {
    if (driverId) {
      const driver = await pool.query(
        `SELECT 1 FROM usuarios WHERE id = $1 AND empresa_id = $2 AND rol = 'repartidor' AND estado = 'activo'`,
        [driverId, req.user.empresa_id]
      );
      if (!driver.rowCount) return res.status(404).json({ error: 'Repartidor no disponible' });
    }
    const result = await pool.query(
      `INSERT INTO vehiculos (empresa_id, placa, nombre, repartidor_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.empresa_id, plate, name, driverId]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'La placa o el repartidor ya están asignados' });
    }
    logger.error('vehicle_creation_failed', { error, companyId: req.user.empresa_id });
    return res.status(500).json({ error: 'No fue posible crear el vehículo' });
  }
});

router.put('/vehiculos/:id', checkRole(['admin']), requireModule('logistica'), async (req, res) => {
  const vehicleId = Number(req.params.id);
  const plate = cleanText(req.body.placa, 16, true)?.toUpperCase();
  const name = cleanText(req.body.nombre, 80, true);
  const state = req.body.estado;
  const driverId = req.body.repartidor_id ? Number(req.body.repartidor_id) : null;
  if (!positiveId(vehicleId) || !plate || !name || !VEHICLE_STATES.has(state)
      || (driverId && !positiveId(driverId))) {
    return res.status(400).json({ error: 'Datos del vehículo inválidos' });
  }
  try {
    if (state !== 'activo') {
      const loaded = await pool.query(
        `SELECT 1 FROM inventario_vehiculos iv
         JOIN vehiculos v ON v.id = iv.vehiculo_id
         WHERE v.id = $1 AND v.empresa_id = $2 AND iv.cantidad > 0 LIMIT 1`,
        [vehicleId, req.user.empresa_id]
      );
      if (loaded.rowCount) {
        return res.status(409).json({ error: 'Descarga el inventario antes de cambiar el estado del vehículo' });
      }
    }
    if (driverId) {
      const driver = await pool.query(
        `SELECT 1 FROM usuarios WHERE id = $1 AND empresa_id = $2 AND rol = 'repartidor' AND estado = 'activo'`,
        [driverId, req.user.empresa_id]
      );
      if (!driver.rowCount) return res.status(404).json({ error: 'Repartidor no disponible' });
    }
    const result = await pool.query(
      `UPDATE vehiculos SET placa = $1, nombre = $2, estado = $3,
              repartidor_id = $4, actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $5 AND empresa_id = $6 RETURNING *`,
      [plate, name, state, driverId, vehicleId, req.user.empresa_id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Vehículo no encontrado' });
    return res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'La placa o el repartidor ya están asignados' });
    }
    return res.status(500).json({ error: 'No fue posible actualizar el vehículo' });
  }
});

router.post('/vehiculos/:id/movimientos', checkRole(['admin']), requireModule('logistica'), async (req, res) => {
  const vehicleId = Number(req.params.id);
  const productId = Number(req.body.producto_id);
  const quantity = Number(req.body.cantidad);
  const type = req.body.tipo;
  if (!positiveId(vehicleId) || !positiveId(productId) || !Number.isInteger(quantity)
      || quantity < 1 || quantity > 1000000 || !['carga', 'descarga'].includes(type)) {
    return res.status(400).json({ error: 'Movimiento de inventario inválido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const vehicle = await client.query(
      `SELECT id FROM vehiculos WHERE id = $1 AND empresa_id = $2 AND estado = 'activo' FOR UPDATE`,
      [vehicleId, req.user.empresa_id]
    );
    if (!vehicle.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vehículo activo no encontrado' });
    }
    const product = await client.query(
      `SELECT id, stock FROM productos WHERE id = $1 AND empresa_id = $2 AND activo = TRUE FOR UPDATE`,
      [productId, req.user.empresa_id]
    );
    if (!product.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    const inventory = await client.query(
      `SELECT cantidad FROM inventario_vehiculos WHERE vehiculo_id = $1 AND producto_id = $2 FOR UPDATE`,
      [vehicleId, productId]
    );
    const onboard = Number(inventory.rows[0]?.cantidad || 0);
    if ((type === 'carga' && Number(product.rows[0].stock) < quantity)
        || (type === 'descarga' && onboard < quantity)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: type === 'carga' ? 'Stock insuficiente en bodega' : 'Stock insuficiente en el vehículo' });
    }
    const signedQuantity = type === 'carga' ? quantity : -quantity;
    if (type === 'carga') {
      await client.query(
        `INSERT INTO inventario_vehiculos (vehiculo_id, producto_id, cantidad)
         VALUES ($1, $2, $3)
         ON CONFLICT (vehiculo_id, producto_id) DO UPDATE
         SET cantidad = inventario_vehiculos.cantidad + EXCLUDED.cantidad,
             actualizado_en = CURRENT_TIMESTAMP`,
        [vehicleId, productId, quantity]
      );
    } else {
      await client.query(
        `UPDATE inventario_vehiculos
         SET cantidad = cantidad - $1, actualizado_en = CURRENT_TIMESTAMP
         WHERE vehiculo_id = $2 AND producto_id = $3`,
        [quantity, vehicleId, productId]
      );
    }
    await client.query(
      `UPDATE productos SET stock = stock + $1 WHERE id = $2 AND empresa_id = $3`,
      [-signedQuantity, productId, req.user.empresa_id]
    );
    await client.query(
      `INSERT INTO movimientos_inventario_vehiculos
        (empresa_id, vehiculo_id, producto_id, usuario_id, tipo, cantidad)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.empresa_id, vehicleId, productId, req.user.id, type, signedQuantity]
    );
    await writeAudit({ client, req, action: `vehiculo.${type}`, entity: 'vehiculos', entityId: vehicleId, details: { producto_id: productId, cantidad: quantity } });
    await client.query('COMMIT');
    return res.json({ message: type === 'carga' ? 'Carga registrada' : 'Descarga registrada' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('vehicle_inventory_movement_failed', { error, vehicleId, productId });
    return res.status(500).json({ error: 'No fue posible mover el inventario' });
  } finally {
    client.release();
  }
});

router.get('/mi-vehiculo', checkRole(['repartidor']), requireModule('logistica'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.id, v.placa, v.nombre,
              COALESCE(json_agg(json_build_object(
                'producto_id', p.id, 'nombre', p.nombre, 'precio', p.precio,
                'cantidad', COALESCE(iv.cantidad, 0), 'es_retornable', p.es_retornable,
                'deposito_envase', p.deposito_envase
              ) ORDER BY p.nombre) FILTER (WHERE p.id IS NOT NULL), '[]'::json) AS inventario
       FROM vehiculos v
       LEFT JOIN productos p ON p.empresa_id = v.empresa_id AND p.activo = TRUE
       LEFT JOIN inventario_vehiculos iv ON iv.vehiculo_id = v.id AND iv.producto_id = p.id
       WHERE v.empresa_id = $1 AND v.repartidor_id = $2 AND v.estado = 'activo'
       GROUP BY v.id`,
      [req.user.empresa_id, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'No tienes un vehículo activo asignado' });
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: 'No fue posible cargar el inventario del vehículo' });
  }
});

router.get('/envases', checkRole(['admin']), requireModule('logistica'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id AS producto_id, p.nombre,
              COALESCE(SUM(me.entregados) FILTER (WHERE me.estado = 'aprobado'), 0)::INT AS entregados,
              COALESCE(SUM(me.devueltos) FILTER (WHERE me.estado = 'aprobado'), 0)::INT AS devueltos,
              (COALESCE(SUM(me.entregados) FILTER (WHERE me.estado = 'aprobado'), 0)
               - COALESCE(SUM(me.devueltos) FILTER (WHERE me.estado = 'aprobado'), 0))::INT AS pendientes,
              COALESCE(SUM(me.deposito_cobrado) FILTER (WHERE me.estado = 'aprobado'), 0) AS depositos
       FROM productos p
       LEFT JOIN movimientos_envases me ON me.producto_id = p.id AND me.empresa_id = p.empresa_id
       WHERE p.empresa_id = $1 AND p.activo = TRUE AND p.es_retornable = TRUE
       GROUP BY p.id, p.nombre ORDER BY p.nombre`,
      [req.user.empresa_id]
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ error: 'No fue posible cargar el control de envases' });
  }
});

router.post('/comprobantes/:pedidoId', checkRole(['repartidor']), requireModule('logistica'), async (req, res) => {
  const orderId = Number(req.params.pedidoId);
  const receiver = cleanText(req.body.receptor_nombre, 120, true);
  const notes = cleanText(req.body.observaciones, 500);
  const signature = typeof req.body.firma_data === 'string' ? req.body.firma_data : '';
  const latitude = req.body.latitud === null || req.body.latitud === undefined ? null : Number(req.body.latitud);
  const longitude = req.body.longitud === null || req.body.longitud === undefined ? null : Number(req.body.longitud);
  const returns = new Map();
  for (const item of Array.isArray(req.body.envases) ? req.body.envases : []) {
    const productId = Number(item.producto_id);
    const quantity = Number(item.devueltos);
    if (!positiveId(productId) || !Number.isInteger(quantity) || quantity < 0 || quantity > 1000) {
      return res.status(400).json({ error: 'Cantidad de envases inválida' });
    }
    returns.set(productId, quantity);
  }
  if (!positiveId(orderId) || !receiver || notes === undefined
      || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature)
      || signature.length < 100 || signature.length > 80000
      || (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90))
      || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
    return res.status(400).json({ error: 'Comprobante de entrega inválido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [req.user.empresa_id, req.user.id]);
    const orderResult = await client.query(
      `SELECT p.id, p.cliente_id, p.estado, p.subtotal_productos,
              p.metodo_pago, u.nombre AS cliente_nombre
       FROM pedidos p JOIN usuarios u ON u.id = p.cliente_id
       WHERE p.id = $1 AND p.empresa_id = $2 AND p.repartidor_id = $3 FOR UPDATE`,
      [orderId, req.user.empresa_id, req.user.id]
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    if (!['asignado', 'en_camino'].includes(order.estado)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El pedido ya no admite comprobante' });
    }
    const closing = await client.query(
      `SELECT estado_revision FROM cierres_ruta
       WHERE empresa_id = $1 AND repartidor_id = $2 AND fecha = $3::date
         AND estado_revision <> 'observado'`,
      [req.user.empresa_id, req.user.id, localDate()]
    );
    if (closing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'La ruta de hoy ya fue cerrada. Solicita una observación para corregirla.'
      });
    }
    const details = await client.query(
      `SELECT dp.producto_id, dp.cantidad, dp.es_retornable,
              dp.deposito_unitario AS deposito_envase
       FROM detalle_pedidos dp
       WHERE dp.pedido_id = $1`,
      [orderId]
    );
    const returnableIds = new Set(details.rows.filter((row) => row.es_retornable).map((row) => row.producto_id));
    if ([...returns.keys()].some((id) => !returnableIds.has(id))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Se incluyó un producto que no utiliza envase retornable' });
    }
    await client.query(
      `INSERT INTO comprobantes_entrega
        (pedido_id, empresa_id, repartidor_id, receptor_nombre, firma_data, observaciones, latitud, longitud)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orderId, req.user.empresa_id, req.user.id, receiver, signature, notes, latitude, longitude]
    );
    let totalDeposit = 0;
    for (const detail of details.rows.filter((row) => row.es_retornable)) {
      const returned = returns.get(detail.producto_id) || 0;
      const deposit = Math.max(Number(detail.cantidad) - returned, 0) * Number(detail.deposito_envase);
      totalDeposit += deposit;
      await client.query(
        `INSERT INTO movimientos_envases
          (empresa_id, repartidor_id, cliente_id, cliente_nombre, producto_id,
           fuente_tipo, fuente_id, entregados, devueltos, deposito_cobrado, estado)
         VALUES ($1, $2, $3, $4, $5, 'pedido', $6, $7, $8, $9, 'aprobado')`,
        [req.user.empresa_id, req.user.id, order.cliente_id, order.cliente_nombre,
          detail.producto_id, orderId, detail.cantidad, returned, deposit]
      );
    }
    await client.query(
      `UPDATE pedidos SET estado = 'entregado', entregado_en = CURRENT_TIMESTAMP,
              deposito_envases = $1,
              total = subtotal_productos + $1,
              actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $2 AND empresa_id = $3`,
      [Number(totalDeposit.toFixed(2)), orderId, req.user.empresa_id]
    );
    await writeAudit({ client, req, action: 'pedido.entrega_comprobada', entity: 'pedidos', entityId: orderId, details: { receptor: receiver, deposito_envases: totalDeposit } });
    await client.query('COMMIT');

    req.app.get('io')?.to(`empresa:${req.user.empresa_id}:admins`).emit('pedido_actualizado', { pedidoId: orderId, estado: 'entregado' });
    req.app.get('io')?.to(`user:${order.cliente_id}`).emit('pedido_actualizado', { pedidoId: orderId, estado: 'entregado' });
    req.app.get('io')?.to(`user:${order.cliente_id}`).emit('confirmacion_entrega', { pedidoId: orderId });
    return res.status(201).json({
      pedido_id: orderId,
      estado: 'entregado',
      subtotal_productos: Number(order.subtotal_productos),
      deposito_envases: Number(totalDeposit.toFixed(2)),
      total: Number((Number(order.subtotal_productos) + totalDeposit).toFixed(2)),
      metodo_pago: order.metodo_pago
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'El comprobante ya fue registrado' });
    logger.error('delivery_proof_creation_failed', { error, orderId });
    return res.status(500).json({ error: 'No fue posible registrar el comprobante' });
  } finally {
    client.release();
  }
});

router.get('/comprobantes/:pedidoId', async (req, res) => {
  const orderId = Number(req.params.pedidoId);
  if (!positiveId(orderId)) return res.status(400).json({ error: 'Pedido inválido' });
  try {
    const result = await pool.query(
      `SELECT ce.pedido_id, ce.repartidor_id, ce.receptor_nombre, ce.firma_data,
              ce.observaciones, ce.latitud, ce.longitud, ce.creado_en,
              p.cliente_id, p.repartidor_id AS pedido_repartidor_id,
              p.subtotal_productos, p.deposito_envases, p.total, p.metodo_pago
       FROM comprobantes_entrega ce JOIN pedidos p ON p.id = ce.pedido_id
       WHERE ce.pedido_id = $1 AND ce.empresa_id = $2`,
      [orderId, req.user.empresa_id]
    );
    const proof = result.rows[0];
    if (!proof) return res.status(404).json({ error: 'Comprobante no encontrado' });
    const allowed = req.user.rol === 'admin'
      || (req.user.rol === 'cliente' && proof.cliente_id === req.user.id)
      || (req.user.rol === 'repartidor' && proof.pedido_repartidor_id === req.user.id);
    if (!allowed) return res.status(403).json({ error: 'No puedes consultar este comprobante' });
    delete proof.cliente_id;
    delete proof.pedido_repartidor_id;
    return res.json(proof);
  } catch (error) {
    return res.status(500).json({ error: 'No fue posible cargar el comprobante' });
  }
});

router.get('/cierres', requireModule('logistica'), checkRole(['admin', 'repartidor']), async (req, res) => {
  try {
    const params = [req.user.empresa_id];
    const driverFilter = req.user.rol === 'repartidor' ? 'AND cr.repartidor_id = $2' : '';
    if (req.user.rol === 'repartidor') params.push(req.user.id);
    const result = await pool.query(
      `SELECT cr.*, u.nombre AS repartidor_nombre, v.placa AS vehiculo_placa,
              rev.nombre AS revisor_nombre
       FROM cierres_ruta cr
       JOIN usuarios u ON u.id = cr.repartidor_id
       LEFT JOIN vehiculos v ON v.id = cr.vehiculo_id
       LEFT JOIN usuarios rev ON rev.id = cr.revisado_por
       WHERE cr.empresa_id = $1 ${driverFilter}
       ORDER BY cr.fecha DESC, cr.creado_en DESC LIMIT 100`,
      params
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ error: 'No fue posible cargar los cierres' });
  }
});

router.post('/cierres', checkRole(['repartidor']), requireModule('logistica'), async (req, res) => {
  const date = req.body.fecha || localDate();
  const declared = Number(req.body.efectivo_declarado);
  const expenses = Number(req.body.gastos || 0);
  const notes = cleanText(req.body.observaciones, 500);
  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00-05:00`) : null;
  const oldestAllowed = new Date(`${localDate()}T12:00:00-05:00`).getTime()
    - (7 * 24 * 60 * 60 * 1000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > localDate()
      || !dateValue || Number.isNaN(dateValue.getTime()) || dateValue.getTime() < oldestAllowed
      || !Number.isFinite(declared) || declared < 0 || declared > 999999
      || !Number.isFinite(expenses) || expenses < 0 || expenses > 999999 || notes === undefined) {
    return res.status(400).json({ error: 'Datos del cierre inválidos' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [req.user.empresa_id, req.user.id]);
    const pending = await client.query(
      `SELECT COUNT(*)::INT AS total FROM ventas_ruta
       WHERE empresa_id = $1 AND repartidor_id = $2
         AND (vendido_en AT TIME ZONE 'America/Guayaquil')::date = $3::date
         AND estado_revision = 'pendiente'`,
      [req.user.empresa_id, req.user.id, date]
    );
    if (pending.rows[0].total > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'No puedes cerrar la ruta mientras existan ventas pendientes de revisión.'
      });
    }
    const totals = await client.query(
      `WITH operaciones AS (
         SELECT metodo_pago, total
         FROM ventas_ruta
         WHERE empresa_id = $1 AND repartidor_id = $2
           AND estado_revision = 'aprobada'
           AND (vendido_en AT TIME ZONE 'America/Guayaquil')::date = $3::date
         UNION ALL
         SELECT metodo_pago, total
         FROM pedidos
         WHERE empresa_id = $1 AND repartidor_id = $2 AND estado = 'entregado'
           AND (entregado_en AT TIME ZONE 'America/Guayaquil')::date = $3::date
       )
       SELECT COALESCE(SUM(total) FILTER (WHERE metodo_pago = 'efectivo'), 0) AS efectivo,
              COALESCE(SUM(total) FILTER (WHERE metodo_pago = 'transferencia'), 0) AS transferencias,
              COALESCE(SUM(total) FILTER (WHERE metodo_pago = 'credito'), 0) AS creditos
       FROM operaciones`,
      [req.user.empresa_id, req.user.id, date]
    );
    const vehicle = await client.query(
      `SELECT id FROM vehiculos WHERE empresa_id = $1 AND repartidor_id = $2 AND estado = 'activo'`,
      [req.user.empresa_id, req.user.id]
    );
    const cashSales = Number(totals.rows[0].efectivo);
    const expected = Number((cashSales - expenses).toFixed(2));
    const difference = Number((declared - expected).toFixed(2));
    const result = await client.query(
      `INSERT INTO cierres_ruta
        (empresa_id, repartidor_id, vehiculo_id, fecha, efectivo_ventas,
         transferencias, creditos, gastos, efectivo_esperado, efectivo_declarado,
         diferencia, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (empresa_id, repartidor_id, fecha) DO UPDATE
       SET vehiculo_id = EXCLUDED.vehiculo_id, efectivo_ventas = EXCLUDED.efectivo_ventas,
           transferencias = EXCLUDED.transferencias, creditos = EXCLUDED.creditos,
           gastos = EXCLUDED.gastos, efectivo_esperado = EXCLUDED.efectivo_esperado,
           efectivo_declarado = EXCLUDED.efectivo_declarado, diferencia = EXCLUDED.diferencia,
           observaciones = EXCLUDED.observaciones, estado_revision = 'pendiente',
           nota_revision = NULL, revisado_por = NULL, revisado_en = NULL,
           creado_en = CURRENT_TIMESTAMP
       WHERE cierres_ruta.estado_revision IN ('pendiente', 'observado')
       RETURNING *`,
      [req.user.empresa_id, req.user.id, vehicle.rows[0]?.id || null, date, cashSales,
        Number(totals.rows[0].transferencias), Number(totals.rows[0].creditos), expenses,
        expected, declared, difference, notes]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El cierre aprobado ya no puede modificarse' });
    }
    await writeAudit({
      client,
      req,
      action: 'cierre_ruta.registrado',
      entity: 'cierres_ruta',
      entityId: result.rows[0].id,
      details: { fecha: date, efectivo_esperado: expected, diferencia: difference }
    });
    await client.query('COMMIT');
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('route_closing_failed', { error, userId: req.user.id });
    return res.status(500).json({ error: 'No fue posible registrar el cierre' });
  } finally {
    client.release();
  }
});

router.put('/cierres/:id/revision', checkRole(['admin']), requireModule('logistica'), async (req, res) => {
  const closingId = Number(req.params.id);
  const decision = req.body.decision;
  const note = cleanText(req.body.nota, 500);
  if (!positiveId(closingId) || !REVIEW_STATES.has(decision) || note === undefined) {
    return res.status(400).json({ error: 'Revisión inválida' });
  }
  try {
    const state = decision === 'aprobar' ? 'aprobado' : 'observado';
    const result = await pool.query(
      `UPDATE cierres_ruta SET estado_revision = $1, nota_revision = $2,
              revisado_por = $3, revisado_en = CURRENT_TIMESTAMP
       WHERE id = $4 AND empresa_id = $5 AND estado_revision = 'pendiente'
         AND ($1::text <> 'aprobado' OR NOT EXISTS (
           SELECT 1 FROM ventas_ruta vr
           WHERE vr.empresa_id = cierres_ruta.empresa_id
             AND vr.repartidor_id = cierres_ruta.repartidor_id
             AND vr.vendido_en::date = cierres_ruta.fecha
             AND vr.estado_revision = 'pendiente'
         ))
       RETURNING id, repartidor_id, estado_revision`,
      [state, note, req.user.id, closingId, req.user.empresa_id]
    );
    if (!result.rowCount) {
      return res.status(409).json({ error: 'El cierre ya fue revisado o aún tiene ventas pendientes' });
    }
    req.app.get('io')?.to(`user:${result.rows[0].repartidor_id}`).emit('cierre_ruta_revisado', { cierreId: closingId, estado: state });
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: 'No fue posible revisar el cierre' });
  }
});

module.exports = router;
