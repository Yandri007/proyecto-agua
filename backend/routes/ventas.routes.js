const express = require('express');
const pool = require('../config/database');
const { verifyToken, checkRole } = require('../middleware/auth');
const { requireActiveSubscription, getPlan } = require('../utils/plans');
const { requireModule, getCompanyModules } = require('../utils/modules');
const { writeAudit } = require('../utils/audit');
const logger = require('../utils/logger');

const router = express.Router();
const PAYMENT_METHODS = new Set(['efectivo', 'transferencia', 'credito', 'otro']);

const cleanOptionalText = (value, maxLength) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > maxLength || /[<>]/.test(value)) {
    return undefined;
  }
  return value.trim();
};

const parseItems = (items) => {
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) return null;
  const quantities = new Map();
  for (const item of items) {
    const productId = Number(item.producto_id);
    const quantity = Number(item.cantidad);
    if (!Number.isInteger(productId) || productId <= 0
        || !Number.isInteger(quantity) || quantity <= 0 || quantity > 1000) {
      return null;
    }
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  return quantities;
};

const parseContainerReturns = (items) => {
  const returns = new Map();
  for (const item of items) {
    const productId = Number(item.producto_id);
    const quantity = Number(item.envases_devueltos || 0);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000) return null;
    returns.set(productId, (returns.get(productId) || 0) + quantity);
  }
  return returns;
};

const serializeSaleRows = `
  SELECT vr.id, vr.repartidor_id, vr.cliente_nombre, vr.cliente_telefono,
         vr.direccion, vr.metodo_pago, vr.referencia_pago, vr.total,
         vr.estado_revision, vr.observaciones, vr.nota_revision,
         vr.vendido_en, vr.revisado_en, vr.creado_en, vr.vehiculo_id,
         vr.origen_inventario, veh.placa AS vehiculo_placa,
         rep.nombre AS repartidor_nombre,
         rev.nombre AS revisor_nombre,
         COALESCE(
           json_agg(
             json_build_object(
               'producto_id', dvr.producto_id,
               'nombre', dvr.producto_nombre,
               'cantidad', dvr.cantidad,
               'precio_unitario', dvr.precio_unitario,
               'envases_devueltos', dvr.envases_devueltos,
               'deposito_unitario', dvr.deposito_unitario
             ) ORDER BY dvr.id
           ) FILTER (WHERE dvr.id IS NOT NULL),
           '[]'::json
         ) AS productos
  FROM ventas_ruta vr
  JOIN usuarios rep ON rep.id = vr.repartidor_id
  LEFT JOIN usuarios rev ON rev.id = vr.revisado_por
  LEFT JOIN vehiculos veh ON veh.id = vr.vehiculo_id
  LEFT JOIN detalle_ventas_ruta dvr ON dvr.venta_id = vr.id`;

router.use(verifyToken, requireActiveSubscription, requireModule('ventas_ruta'));

router.post('/ruta', checkRole(['repartidor']), async (req, res) => {
  const customerName = cleanOptionalText(req.body.cliente_nombre, 120);
  const customerPhone = cleanOptionalText(req.body.cliente_telefono, 20);
  const address = cleanOptionalText(req.body.direccion, 300);
  const paymentReference = cleanOptionalText(req.body.referencia_pago, 120);
  const notes = cleanOptionalText(req.body.observaciones, 500);
  const paymentMethod = req.body.metodo_pago;
  const idempotencyKey = cleanOptionalText(req.body.idempotency_key, 80);
  const quantities = parseItems(req.body.productos);
  const containerReturns = Array.isArray(req.body.productos)
    ? parseContainerReturns(req.body.productos)
    : null;

  if (!customerName || customerName.length < 2) {
    return res.status(400).json({ error: 'Ingresa el nombre del cliente' });
  }
  if (customerPhone === undefined || address === undefined
      || paymentReference === undefined || notes === undefined) {
    return res.status(400).json({ error: 'Uno de los textos contiene datos inválidos' });
  }
  if (!PAYMENT_METHODS.has(paymentMethod)) {
    return res.status(400).json({ error: 'Método de pago inválido' });
  }
  if (!idempotencyKey || !/^[A-Za-z0-9_-]{10,80}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: 'Identificador de venta inválido' });
  }
  if (!quantities || !containerReturns) {
    return res.status(400).json({ error: 'La venta debe incluir productos válidos' });
  }

  const soldAt = req.body.vendido_en ? new Date(req.body.vendido_en) : new Date();
  const oldestAllowed = Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (Number.isNaN(soldAt.getTime()) || soldAt.getTime() < oldestAllowed
      || soldAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return res.status(400).json({ error: 'Fecha de venta inválida' });
  }

  const plan = req.user.empresa_plan === 'prueba'
    ? getPlan('profesional')
    : getPlan(req.user.empresa_plan);
  if (plan.limits.monthlyOrders !== null) {
    const usage = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM pedidos
          WHERE empresa_id = $1
            AND created_at >= date_trunc('month', CURRENT_TIMESTAMP))
         +
         (SELECT COUNT(*) FROM ventas_ruta
          WHERE empresa_id = $1
            AND estado_revision <> 'rechazada'
            AND vendido_en >= date_trunc('month', CURRENT_TIMESTAMP)) AS total`,
      [req.user.empresa_id]
    );
    if (Number(usage.rows[0].total) >= plan.limits.monthlyOrders) {
      return res.status(409).json({
        error: 'La empresa alcanzó el límite mensual de operaciones de su plan',
        code: 'PLAN_LIMIT_REACHED'
      });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id, total, estado_revision
       FROM ventas_ruta
       WHERE empresa_id = $1 AND idempotency_key = $2`,
      [req.user.empresa_id, idempotencyKey]
    );
    if (existing.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(200).json({ ...existing.rows[0], duplicate: true });
    }
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [req.user.empresa_id, req.user.id]);
    const closing = await client.query(
      `SELECT estado_revision FROM cierres_ruta
       WHERE empresa_id = $1 AND repartidor_id = $2
         AND fecha = ($3::timestamptz AT TIME ZONE 'America/Guayaquil')::date
         AND estado_revision <> 'observado'`,
      [req.user.empresa_id, req.user.id, soldAt.toISOString()]
    );
    if (closing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'La ruta de esa fecha ya fue cerrada. Solicita una observación para corregirla.'
      });
    }

    const productIds = [...quantities.keys()];
    const products = await client.query(
      `SELECT id, nombre, precio, stock, es_retornable, deposito_envase
       FROM productos
       WHERE empresa_id = $1 AND activo = TRUE AND id = ANY($2::int[])
       FOR UPDATE`,
      [req.user.empresa_id, productIds]
    );
    if (products.rowCount !== productIds.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Uno de los productos no está disponible' });
    }

    const logisticsEnabled = getCompanyModules(req.user.empresa_modulos).logistica;
    let vehicle = null;
    let onboardInventory = new Map();
    if (logisticsEnabled) {
      const vehicleResult = await client.query(
        `SELECT id FROM vehiculos
         WHERE empresa_id = $1 AND repartidor_id = $2 AND estado = 'activo'
         FOR UPDATE`,
        [req.user.empresa_id, req.user.id]
      );
      vehicle = vehicleResult.rows[0];
      if (!vehicle) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Necesitas un vehículo activo asignado para registrar ventas' });
      }
      const inventoryResult = await client.query(
        `SELECT producto_id, cantidad FROM inventario_vehiculos
         WHERE vehiculo_id = $1 AND producto_id = ANY($2::int[]) FOR UPDATE`,
        [vehicle.id, productIds]
      );
      onboardInventory = new Map(inventoryResult.rows.map((row) => [row.producto_id, Number(row.cantidad)]));
    }

    let total = 0;
    for (const product of products.rows) {
      const quantity = quantities.get(product.id);
      const available = logisticsEnabled ? (onboardInventory.get(product.id) || 0) : Number(product.stock);
      if (available < quantity) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Stock insuficiente para ${product.nombre}. Disponible: ${available}`
        });
      }
      total += Number(product.precio) * quantity;
      if (product.es_retornable) {
        total += Math.max(quantity - (containerReturns.get(product.id) || 0), 0)
          * Number(product.deposito_envase);
      } else if ((containerReturns.get(product.id) || 0) > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `${product.nombre} no utiliza envase retornable` });
      }
    }
    total = Number(total.toFixed(2));

    const saleResult = await client.query(
      `INSERT INTO ventas_ruta
        (empresa_id, repartidor_id, cliente_nombre, cliente_telefono,
         direccion, metodo_pago, referencia_pago, total, observaciones,
         idempotency_key, vendido_en, vehiculo_id, origen_inventario)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        req.user.empresa_id,
        req.user.id,
        customerName,
        customerPhone,
        address,
        paymentMethod,
        paymentReference,
        total,
        notes,
        idempotencyKey,
        soldAt.toISOString(),
        vehicle?.id || null,
        logisticsEnabled ? 'vehiculo' : 'bodega'
      ]
    );
    const sale = saleResult.rows[0];

    for (const product of products.rows) {
      const quantity = quantities.get(product.id);
      const returned = containerReturns.get(product.id) || 0;
      await client.query(
        `INSERT INTO detalle_ventas_ruta
          (venta_id, producto_id, producto_nombre, cantidad, precio_unitario,
           envases_devueltos, deposito_unitario)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [sale.id, product.id, product.nombre, quantity, product.precio,
          returned, product.es_retornable ? product.deposito_envase : 0]
      );
      if (logisticsEnabled) {
        await client.query(
          `UPDATE inventario_vehiculos SET cantidad = cantidad - $1, actualizado_en = CURRENT_TIMESTAMP
           WHERE vehiculo_id = $2 AND producto_id = $3`,
          [quantity, vehicle.id, product.id]
        );
        await client.query(
          `INSERT INTO movimientos_inventario_vehiculos
            (empresa_id, vehiculo_id, producto_id, usuario_id, tipo, cantidad, referencia)
           VALUES ($1, $2, $3, $4, 'venta_ruta', $5, $6)`,
          [req.user.empresa_id, vehicle.id, product.id, req.user.id, -quantity, `venta_ruta:${sale.id}`]
        );
      } else {
        await client.query(
          `UPDATE productos SET stock = stock - $1 WHERE id = $2 AND empresa_id = $3`,
          [quantity, product.id, req.user.empresa_id]
        );
      }
      if (product.es_retornable) {
        const deposit = Math.max(quantity - returned, 0) * Number(product.deposito_envase);
        await client.query(
          `INSERT INTO movimientos_envases
            (empresa_id, repartidor_id, cliente_nombre, producto_id, fuente_tipo,
             fuente_id, entregados, devueltos, deposito_cobrado, estado)
           VALUES ($1, $2, $3, $4, 'venta_ruta', $5, $6, $7, $8, 'pendiente')`,
          [req.user.empresa_id, req.user.id, customerName, product.id, sale.id,
            quantity, returned, deposit]
        );
      }
    }

    await writeAudit({
      client,
      req,
      action: 'venta_ruta.registrada',
      entity: 'ventas_ruta',
      entityId: sale.id,
      details: { total, metodo_pago: paymentMethod }
    });
    await client.query('COMMIT');

    req.app.get('io')?.to(`empresa:${req.user.empresa_id}:admins`).emit('venta_ruta_registrada', {
      ventaId: sale.id,
      repartidor: req.user.nombre,
      total
    });
    return res.status(201).json({ ...sale, productos: products.rows.map((product) => ({
      producto_id: product.id,
      nombre: product.nombre,
      cantidad: quantities.get(product.id),
      precio_unitario: product.precio,
      envases_devueltos: containerReturns.get(product.id) || 0,
      deposito_unitario: product.es_retornable ? product.deposito_envase : 0
    })) });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('route_sale_creation_failed', { error, companyId: req.user.empresa_id });
    if (error.code === '23505') {
      return res.status(409).json({ error: 'La venta ya fue registrada' });
    }
    return res.status(500).json({ error: 'No fue posible registrar la venta' });
  } finally {
    client.release();
  }
});

router.get('/mis-ventas', checkRole(['repartidor']), async (req, res) => {
  try {
    const result = await pool.query(
      `${serializeSaleRows}
       WHERE vr.empresa_id = $1 AND vr.repartidor_id = $2
       GROUP BY vr.id, rep.nombre, rev.nombre, veh.placa
       ORDER BY vr.vendido_en DESC
       LIMIT 100`,
      [req.user.empresa_id, req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    logger.error('driver_route_sales_read_failed', { error, userId: req.user.id });
    return res.status(500).json({ error: 'No fue posible cargar las ventas en ruta' });
  }
});

router.get('/ruta', checkRole(['admin']), async (req, res) => {
  const status = req.query.estado || '';
  if (status && !['pendiente', 'aprobada', 'rechazada'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  try {
    const result = await pool.query(
      `${serializeSaleRows}
       WHERE vr.empresa_id = $1
         AND ($2::text = '' OR vr.estado_revision = $2)
       GROUP BY vr.id, rep.nombre, rev.nombre, veh.placa
       ORDER BY (vr.estado_revision = 'pendiente') DESC, vr.vendido_en DESC
       LIMIT 250`,
      [req.user.empresa_id, status]
    );
    return res.json(result.rows);
  } catch (error) {
    logger.error('route_sales_admin_read_failed', { error, companyId: req.user.empresa_id });
    return res.status(500).json({ error: 'No fue posible cargar las ventas en ruta' });
  }
});

router.get('/resumen', checkRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE estado_revision = 'pendiente')::INT AS pendientes,
         COUNT(*) FILTER (WHERE estado_revision = 'aprobada')::INT AS aprobadas,
         COALESCE(SUM(total) FILTER (WHERE estado_revision = 'aprobada'), 0) AS total_aprobado,
         COALESCE(SUM(total) FILTER (
           WHERE estado_revision = 'aprobada'
             AND vendido_en >= date_trunc('month', CURRENT_TIMESTAMP)
         ), 0) AS total_mes
       FROM ventas_ruta
       WHERE empresa_id = $1`,
      [req.user.empresa_id]
    );
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: 'No fue posible cargar el resumen' });
  }
});

router.put('/ruta/:id/revision', checkRole(['admin']), async (req, res) => {
  const saleId = Number(req.params.id);
  const decision = req.body.decision;
  const reviewNote = cleanOptionalText(req.body.nota, 500);
  if (!Number.isInteger(saleId) || saleId <= 0
      || !['aprobar', 'rechazar'].includes(decision)
      || reviewNote === undefined) {
    return res.status(400).json({ error: 'Revisión inválida' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const saleResult = await client.query(
      `SELECT id, repartidor_id, total, estado_revision, vehiculo_id, origen_inventario
       FROM ventas_ruta
       WHERE id = $1 AND empresa_id = $2
       FOR UPDATE`,
      [saleId, req.user.empresa_id]
    );
    const sale = saleResult.rows[0];
    if (!sale) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    if (sale.estado_revision !== 'pendiente') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La venta ya fue revisada' });
    }

    const newStatus = decision === 'aprobar' ? 'aprobada' : 'rechazada';
    if (newStatus === 'rechazada') {
      if (sale.origen_inventario === 'vehiculo' && sale.vehiculo_id) {
        await client.query(
          `UPDATE inventario_vehiculos iv SET cantidad = iv.cantidad + d.cantidad,
                  actualizado_en = CURRENT_TIMESTAMP
           FROM detalle_ventas_ruta d
           WHERE d.venta_id = $1 AND iv.vehiculo_id = $2 AND iv.producto_id = d.producto_id`,
          [saleId, sale.vehiculo_id]
        );
        await client.query(
          `INSERT INTO movimientos_inventario_vehiculos
            (empresa_id, vehiculo_id, producto_id, usuario_id, tipo, cantidad, referencia)
           SELECT $1, $2, d.producto_id, $3, 'reversion_venta', d.cantidad, $4
           FROM detalle_ventas_ruta d WHERE d.venta_id = $5`,
          [req.user.empresa_id, sale.vehiculo_id, req.user.id, `venta_ruta:${saleId}`, saleId]
        );
      } else {
        await client.query(
          `UPDATE productos p SET stock = p.stock + d.cantidad
           FROM detalle_ventas_ruta d
           WHERE d.venta_id = $1 AND p.id = d.producto_id AND p.empresa_id = $2`,
          [saleId, req.user.empresa_id]
        );
      }
    }
    await client.query(
      `UPDATE movimientos_envases SET estado = $1
       WHERE empresa_id = $2 AND fuente_tipo = 'venta_ruta' AND fuente_id = $3`,
      [newStatus === 'aprobada' ? 'aprobado' : 'rechazado', req.user.empresa_id, saleId]
    );
    await client.query(
      `UPDATE ventas_ruta
       SET estado_revision = $1,
           nota_revision = $2,
           revisado_por = $3,
           revisado_en = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [newStatus, reviewNote, req.user.id, saleId]
    );
    await writeAudit({
      client,
      req,
      action: `venta_ruta.${newStatus}`,
      entity: 'ventas_ruta',
      entityId: saleId,
      details: { total: sale.total, nota: reviewNote }
    });
    await client.query('COMMIT');

    req.app.get('io')?.to(`user:${sale.repartidor_id}`).emit('venta_ruta_revisada', {
      ventaId: saleId,
      estado: newStatus
    });
    return res.json({ id: saleId, estado_revision: newStatus });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('route_sale_review_failed', { error, saleId });
    return res.status(500).json({ error: 'No fue posible revisar la venta' });
  } finally {
    client.release();
  }
});

module.exports = router;
