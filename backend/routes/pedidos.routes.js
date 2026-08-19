const express = require('express');
const pool = require('../config/database');
const { verifyToken, checkRole } = require('../middleware/auth');
const { getPlan, requireActiveSubscription } = require('../utils/plans');
const { getCompanyModules } = require('../utils/modules');

const router = express.Router();
const ORDER_PAYMENT_METHODS = new Set(['efectivo', 'transferencia']);

const isPositiveId = (value) => Number.isInteger(Number(value)) && Number(value) > 0;
const isSafeText = (value, min, max) => (
  typeof value === 'string'
  && value.trim().length >= min
  && value.trim().length <= max
  && !/[<>]/.test(value)
);

const emitToAdmins = (req, empresaId, event, payload) => {
  const io = req.app.get('io');
  if (io) io.to(`empresa:${empresaId}:admins`).emit(event, payload);
};

const emitToUser = (req, userId, event, payload) => {
  const io = req.app.get('io');
  if (io) io.to(`user:${userId}`).emit(event, payload);
};

router.use(verifyToken);
router.use(requireActiveSubscription);

router.post('/', checkRole(['cliente']), async (req, res) => {
  const {
    productos,
    direccion_id: addressIdValue,
    direccion_entrega,
    indicaciones_entrega,
    latitud_entrega,
    longitud_entrega,
    metodo_pago: paymentMethod = 'efectivo'
  } = req.body;

  if (!Array.isArray(productos) || productos.length === 0 || productos.length > 50) {
    return res.status(400).json({ error: 'El pedido debe incluir entre 1 y 50 productos' });
  }
  const addressId = addressIdValue === null || addressIdValue === undefined || addressIdValue === ''
    ? null
    : Number(addressIdValue);
  if (addressId !== null && !isPositiveId(addressId)) {
    return res.status(400).json({ error: 'Dirección guardada inválida' });
  }

  let deliveryAddress = direccion_entrega;
  let deliveryInstructions = indicaciones_entrega || null;
  let latitudeValue = latitud_entrega;
  let longitudeValue = longitud_entrega;
  if (addressId !== null) {
    const savedAddress = await pool.query(
      `SELECT direccion, indicaciones, latitud, longitud
       FROM direcciones_clientes
       WHERE id = $1 AND empresa_id = $2 AND cliente_id = $3`,
      [addressId, req.user.empresa_id, req.user.id]
    );
    if (!savedAddress.rowCount) {
      return res.status(404).json({ error: 'La dirección guardada ya no está disponible' });
    }
    deliveryAddress = savedAddress.rows[0].direccion;
    deliveryInstructions = savedAddress.rows[0].indicaciones;
    latitudeValue = savedAddress.rows[0].latitud;
    longitudeValue = savedAddress.rows[0].longitud;
  }

  if (!isSafeText(deliveryAddress, 3, 300)) {
    return res.status(400).json({ error: 'Dirección de entrega inválida' });
  }
  if (deliveryInstructions && !isSafeText(deliveryInstructions, 1, 300)) {
    return res.status(400).json({ error: 'Indicaciones de entrega inválidas' });
  }
  if (!ORDER_PAYMENT_METHODS.has(paymentMethod)) {
    return res.status(400).json({ error: 'Método de pago inválido' });
  }

  const hasCoordinates = latitudeValue !== null
    && latitudeValue !== undefined
    && longitudeValue !== null
    && longitudeValue !== undefined;
  const latitude = hasCoordinates ? Number(latitudeValue) : null;
  const longitude = hasCoordinates ? Number(longitudeValue) : null;
  if (hasCoordinates && (
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
  )) {
    return res.status(400).json({ error: 'Ubicación de entrega inválida' });
  }

  const quantities = new Map();
  for (const item of productos) {
    const productId = Number(item.producto_id);
    const quantity = Number(item.cantidad);
    if (!Number.isInteger(productId) || productId <= 0
        || !Number.isInteger(quantity) || quantity <= 0 || quantity > 1000) {
      return res.status(400).json({ error: 'Producto o cantidad inválida' });
    }
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }

  const effectivePlan = req.user.empresa_plan === 'prueba'
    ? getPlan('profesional')
    : getPlan(req.user.empresa_plan);
  if (effectivePlan.limits.monthlyOrders !== null) {
    const usageResult = await pool.query(
      `SELECT COUNT(*)::INT AS total
       FROM pedidos
       WHERE empresa_id = $1
         AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
      [req.user.empresa_id]
    );
    if (usageResult.rows[0].total >= effectivePlan.limits.monthlyOrders) {
      return res.status(409).json({
        error: 'La empresa alcanzó el límite mensual de pedidos de su plan',
        code: 'PLAN_LIMIT_REACHED'
      });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = [...quantities.keys()];
    const productsResult = await client.query(
      `SELECT id, nombre, precio, stock, es_retornable, deposito_envase
       FROM productos
       WHERE empresa_id = $1 AND activo = TRUE AND id = ANY($2::int[])
       FOR UPDATE`,
      [req.user.empresa_id, ids]
    );

    if (productsResult.rowCount !== ids.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Uno de los productos ya no está disponible' });
    }

    let total = 0;
    for (const product of productsResult.rows) {
      const quantity = quantities.get(product.id);
      if (product.stock < quantity) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Stock insuficiente para ${product.nombre}. Disponible: ${product.stock}`
        });
      }
      total += Number(product.precio) * quantity;
    }
    total = Number(total.toFixed(2));

    const orderResult = await client.query(
      `INSERT INTO pedidos
        (empresa_id, cliente_id, total, subtotal_productos, deposito_envases,
         metodo_pago, direccion_entrega, direccion_cliente_id, indicaciones_entrega,
         latitud_entrega, longitud_entrega, estado)
       VALUES ($1, $2, $3, $3, 0, $4, $5, $6, $7, $8, $9, 'pendiente')
       RETURNING *`,
      [
        req.user.empresa_id,
        req.user.id,
        total,
        paymentMethod,
        deliveryAddress.trim(),
        addressId,
        deliveryInstructions?.trim() || null,
        latitude,
        longitude
      ]
    );
    const order = orderResult.rows[0];

    for (const product of productsResult.rows) {
      const quantity = quantities.get(product.id);
      await client.query(
        `INSERT INTO detalle_pedidos
          (pedido_id, producto_id, cantidad, precio_unitario, es_retornable, deposito_unitario)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, product.id, quantity, product.precio,
          product.es_retornable, product.es_retornable ? product.deposito_envase : 0]
      );
      await client.query(
        `UPDATE productos
         SET stock = stock - $1
         WHERE id = $2 AND empresa_id = $3`,
        [quantity, product.id, req.user.empresa_id]
      );
    }

    await client.query('COMMIT');
    emitToAdmins(req, req.user.empresa_id, 'pedido_recibido', {
      pedido_id: order.id,
      cliente: req.user.nombre,
      total: order.total
    });
    return res.status(201).json(order);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creando pedido:', error);
    return res.status(500).json({ error: 'No fue posible crear el pedido' });
  } finally {
    client.release();
  }
});

router.get('/mis-pedidos', checkRole(['cliente']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, EXISTS (SELECT 1 FROM comprobantes_entrega ce WHERE ce.pedido_id = p.id) AS tiene_comprobante,
              COALESCE(
                json_agg(
                  json_build_object(
                    'producto_id', pr.id,
                    'nombre', pr.nombre,
                    'cantidad', dp.cantidad,
                    'precio_unitario', dp.precio_unitario,
                    'es_retornable', dp.es_retornable,
                    'deposito_unitario', dp.deposito_unitario
                  ) ORDER BY dp.id
                ) FILTER (WHERE dp.id IS NOT NULL),
                '[]'::json
              ) AS productos
       FROM pedidos p
       LEFT JOIN detalle_pedidos dp ON dp.pedido_id = p.id
       LEFT JOIN productos pr ON pr.id = dp.producto_id
       WHERE p.empresa_id = $1
         AND p.cliente_id = $2
         AND p.oculto_para_cliente = FALSE
       GROUP BY p.id
       ORDER BY p.created_at DESC
       LIMIT 100`,
      [req.user.empresa_id, req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error cargando pedidos del cliente:', error);
    return res.status(500).json({ error: 'No fue posible cargar tus pedidos' });
  }
});

router.get('/ubicaciones/activas', checkRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ur.pedido_id, ur.repartidor_id, ur.latitud, ur.longitud,
              ur.precision_metros, ur.actualizado_en,
              rep.nombre AS repartidor_nombre, cli.nombre AS cliente_nombre
       FROM ubicaciones_repartidores ur
       JOIN pedidos p ON p.id = ur.pedido_id AND p.empresa_id = ur.empresa_id
       JOIN usuarios rep ON rep.id = ur.repartidor_id
       JOIN usuarios cli ON cli.id = p.cliente_id
       WHERE ur.empresa_id = $1
         AND p.estado IN ('asignado', 'en_camino')
         AND ur.actualizado_en >= CURRENT_TIMESTAMP - INTERVAL '12 hours'
       ORDER BY ur.actualizado_en DESC`,
      [req.user.empresa_id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error cargando ubicaciones activas:', error);
    return res.status(500).json({ error: 'No fue posible cargar el mapa operativo' });
  }
});

router.get('/:id/ubicacion', checkRole(['cliente', 'admin', 'repartidor']), async (req, res) => {
  const orderId = Number(req.params.id);
  if (!isPositiveId(orderId)) {
    return res.status(400).json({ error: 'Pedido inválido' });
  }

  try {
    const result = await pool.query(
      `SELECT ur.pedido_id, ur.repartidor_id, ur.latitud, ur.longitud,
              ur.precision_metros, ur.actualizado_en,
              p.cliente_id, p.estado
       FROM ubicaciones_repartidores ur
       JOIN pedidos p ON p.id = ur.pedido_id AND p.empresa_id = ur.empresa_id
       WHERE ur.pedido_id = $1 AND ur.empresa_id = $2`,
      [orderId, req.user.empresa_id]
    );
    const location = result.rows[0];
    if (!location) {
      return res.status(404).json({ error: 'El repartidor todavía no comparte su ubicación' });
    }

    const allowed = req.user.rol === 'admin'
      || (req.user.rol === 'cliente' && location.cliente_id === req.user.id)
      || (req.user.rol === 'repartidor' && location.repartidor_id === req.user.id);
    if (!allowed) {
      return res.status(403).json({ error: 'No puedes consultar esta ubicación' });
    }

    return res.json({
      pedido_id: location.pedido_id,
      repartidor_id: location.repartidor_id,
      latitud: location.latitud,
      longitud: location.longitud,
      precision_metros: location.precision_metros,
      actualizado_en: location.actualizado_en
    });
  } catch (error) {
    console.error('Error cargando ubicación del pedido:', error);
    return res.status(500).json({ error: 'No fue posible cargar la ubicación' });
  }
});

router.get('/admin/todos', checkRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.nombre AS cliente_nombre,
              EXISTS (SELECT 1 FROM comprobantes_entrega ce WHERE ce.pedido_id = p.id) AS tiene_comprobante,
              COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'producto_id', pr.id,
                      'nombre', pr.nombre,
                      'cantidad', dp.cantidad,
                      'precio_unitario', dp.precio_unitario,
                      'es_retornable', dp.es_retornable,
                      'deposito_unitario', dp.deposito_unitario
                    ) ORDER BY dp.id
                  )
                  FROM detalle_pedidos dp
                  JOIN productos pr ON pr.id = dp.producto_id
                  WHERE dp.pedido_id = p.id
                ),
                '[]'::json
              ) AS productos
       FROM pedidos p
       JOIN usuarios u ON u.id = p.cliente_id
       WHERE p.empresa_id = $1
       ORDER BY p.created_at DESC
       LIMIT 1000`,
      [req.user.empresa_id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error cargando pedidos de administración:', error);
    return res.status(500).json({ error: 'No fue posible cargar los pedidos' });
  }
});

router.get('/repartidor/total-por-dia/:repartidorId', checkRole(['repartidor']), async (req, res) => {
  if (Number(req.params.repartidorId) !== req.user.id) {
    return res.status(403).json({ error: 'No puedes consultar datos de otro repartidor' });
  }
  try {
    const result = await pool.query(
      `SELECT entregado_en::DATE AS fecha,
              COUNT(*)::INT AS total_pedidos,
              COALESCE(SUM(total), 0) AS total_ventas
       FROM pedidos
       WHERE empresa_id = $1
         AND repartidor_id = $2
         AND estado = 'entregado'
       GROUP BY entregado_en::DATE
       ORDER BY entregado_en::DATE DESC
       LIMIT 30`,
      [req.user.empresa_id, req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error cargando historial de ventas:', error);
    return res.status(500).json({ error: 'No fue posible cargar el historial' });
  }
});

router.get('/repartidor/:repartidorId', checkRole(['repartidor']), async (req, res) => {
  if (Number(req.params.repartidorId) !== req.user.id) {
    return res.status(403).json({ error: 'No puedes consultar pedidos de otro repartidor' });
  }
  try {
    const result = await pool.query(
      `SELECT p.*, u.nombre AS cliente_nombre, u.telefono AS cliente_telefono
       FROM pedidos p
       JOIN usuarios u ON u.id = p.cliente_id
       WHERE p.empresa_id = $1
         AND p.repartidor_id = $2
         AND p.estado IN ('asignado', 'en_camino')
       ORDER BY p.created_at ASC`,
      [req.user.empresa_id, req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error cargando pedidos asignados:', error);
    return res.status(500).json({ error: 'No fue posible cargar los pedidos asignados' });
  }
});

router.get('/reporte/productos', checkRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pr.nombre, SUM(dp.cantidad)::INT AS total_vendido
       FROM detalle_pedidos dp
       JOIN productos pr ON pr.id = dp.producto_id
       JOIN pedidos ped ON ped.id = dp.pedido_id
       WHERE ped.empresa_id = $1 AND ped.estado = 'entregado'
       GROUP BY pr.id, pr.nombre
       ORDER BY total_vendido DESC
       LIMIT 5`,
      [req.user.empresa_id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error generando reporte de productos:', error);
    return res.status(500).json({ error: 'No fue posible generar el reporte' });
  }
});

router.get('/reporte/ventas-por-dia-semana', checkRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `WITH ventas_por_dia AS (
         SELECT EXTRACT(DOW FROM COALESCE(entregado_en, actualizado_en, created_at))::INT AS dia_semana, total
         FROM pedidos
         WHERE empresa_id = $1 AND estado = 'entregado'
       )
       SELECT
         dia_semana,
         CASE dia_semana
           WHEN 0 THEN 'Domingo'
           WHEN 1 THEN 'Lunes'
           WHEN 2 THEN 'Martes'
           WHEN 3 THEN 'Miércoles'
           WHEN 4 THEN 'Jueves'
           WHEN 5 THEN 'Viernes'
           WHEN 6 THEN 'Sábado'
         END AS nombre_dia,
         COUNT(*)::INT AS total_pedidos,
         COALESCE(SUM(total), 0) AS total_ventas
       FROM ventas_por_dia
       GROUP BY dia_semana
       ORDER BY dia_semana`,
      [req.user.empresa_id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error generando ventas por día:', error);
    return res.status(500).json({ error: 'No fue posible generar el reporte' });
  }
});

router.get('/reporte/ventas-por-mes/:anio/:mes', checkRole(['admin']), async (req, res) => {
  const year = Number(req.params.anio);
  const month = Number(req.params.mes);
  if (!Number.isInteger(year) || year < 2020 || year > 2100
      || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Periodo inválido' });
  }
  try {
    const result = await pool.query(
      `SELECT
         EXTRACT(DAY FROM entregado_en)::INT AS dia,
         COUNT(*)::INT AS total_pedidos,
         COALESCE(SUM(total), 0) AS total_ventas
       FROM pedidos
       WHERE empresa_id = $1
         AND estado = 'entregado'
         AND EXTRACT(YEAR FROM entregado_en) = $2
         AND EXTRACT(MONTH FROM entregado_en) = $3
       GROUP BY dia
       ORDER BY dia`,
      [req.user.empresa_id, year, month]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Error generando ventas por mes:', error);
    return res.status(500).json({ error: 'No fue posible generar el reporte' });
  }
});

router.get('/reporte/resumen-rapido', checkRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `WITH pedidos_resumen AS (
         SELECT
           COALESCE(SUM(total) FILTER (
             WHERE estado = 'entregado' AND entregado_en::DATE = CURRENT_DATE
           ), 0) AS ventas_hoy,
           COALESCE(SUM(total) FILTER (
             WHERE estado = 'entregado'
               AND entregado_en >= date_trunc('week', CURRENT_TIMESTAMP)
           ), 0) AS ventas_semana,
           COALESCE(SUM(total) FILTER (
             WHERE estado = 'entregado'
               AND entregado_en >= date_trunc('month', CURRENT_TIMESTAMP)
           ), 0) AS ventas_mes,
           COUNT(*) FILTER (WHERE estado = 'pendiente')::INT AS pedidos_pendientes,
           COUNT(*) FILTER (WHERE estado = 'entregado')::INT AS pedidos_entregados
         FROM pedidos
         WHERE empresa_id = $1
       ), ruta_resumen AS (
         SELECT
           COALESCE(SUM(total) FILTER (
             WHERE estado_revision = 'aprobada' AND vendido_en::DATE = CURRENT_DATE
           ), 0) AS ventas_hoy,
           COALESCE(SUM(total) FILTER (
             WHERE estado_revision = 'aprobada'
               AND vendido_en >= date_trunc('week', CURRENT_TIMESTAMP)
           ), 0) AS ventas_semana,
           COALESCE(SUM(total) FILTER (
             WHERE estado_revision = 'aprobada'
               AND vendido_en >= date_trunc('month', CURRENT_TIMESTAMP)
           ), 0) AS ventas_mes
         FROM ventas_ruta
         WHERE empresa_id = $1
       )
       SELECT p.ventas_hoy + r.ventas_hoy AS ventas_hoy,
              p.ventas_semana + r.ventas_semana AS ventas_semana,
              p.ventas_mes + r.ventas_mes AS ventas_mes,
              p.pedidos_pendientes,
              p.pedidos_entregados
       FROM pedidos_resumen p CROSS JOIN ruta_resumen r`,
      [req.user.empresa_id]
    );
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error generando resumen:', error);
    return res.status(500).json({ error: 'No fue posible generar el resumen' });
  }
});

router.put('/cliente/vaciar-historial', checkRole(['cliente']), async (req, res) => {
  try {
    await pool.query(
      `UPDATE pedidos
       SET oculto_para_cliente = TRUE
       WHERE empresa_id = $1
         AND cliente_id = $2
         AND estado IN ('entregado', 'cancelado')`,
      [req.user.empresa_id, req.user.id]
    );
    return res.json({ message: 'Historial vaciado correctamente' });
  } catch (error) {
    console.error('Error ocultando historial:', error);
    return res.status(500).json({ error: 'No fue posible vaciar el historial' });
  }
});

router.put('/cliente/ocultar/:pedidoId', checkRole(['cliente']), async (req, res) => {
  if (!isPositiveId(req.params.pedidoId)) {
    return res.status(400).json({ error: 'Pedido inválido' });
  }
  try {
    const result = await pool.query(
      `UPDATE pedidos
       SET oculto_para_cliente = TRUE
       WHERE id = $1
         AND empresa_id = $2
         AND cliente_id = $3
         AND estado IN ('entregado', 'cancelado')
       RETURNING id`,
      [Number(req.params.pedidoId), req.user.empresa_id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado o todavía activo' });
    }
    return res.json({ message: 'Pedido ocultado' });
  } catch (error) {
    console.error('Error ocultando pedido:', error);
    return res.status(500).json({ error: 'No fue posible ocultar el pedido' });
  }
});

router.put('/:id/asignar', checkRole(['admin']), async (req, res) => {
  const orderId = Number(req.params.id);
  const driverId = Number(req.body.repartidor_id);
  if (!isPositiveId(orderId) || !isPositiveId(driverId)) {
    return res.status(400).json({ error: 'Pedido o repartidor inválido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const driver = await client.query(
      `SELECT id FROM usuarios
       WHERE id = $1 AND empresa_id = $2
         AND rol = 'repartidor' AND estado = 'activo'`,
      [driverId, req.user.empresa_id]
    );
    if (driver.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Repartidor no disponible' });
    }

    const result = await client.query(
      `UPDATE pedidos
       SET repartidor_id = $1, estado = 'asignado', actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $2 AND empresa_id = $3 AND estado = 'pendiente'
       RETURNING id, cliente_id`,
      [driverId, orderId, req.user.empresa_id]
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El pedido ya no está disponible para asignar' });
    }

    await client.query('COMMIT');
    emitToUser(req, driverId, 'nuevo_pedido_asignado', { pedidoId: orderId });
    emitToUser(req, result.rows[0].cliente_id, 'pedido_actualizado', {
      pedidoId: orderId,
      estado: 'asignado'
    });
    emitToAdmins(req, req.user.empresa_id, 'pedido_actualizado', {
      pedidoId: orderId,
      estado: 'asignado'
    });
    return res.json({ message: 'Repartidor asignado', estado: 'asignado' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error asignando pedido:', error);
    return res.status(500).json({ error: 'No fue posible asignar el pedido' });
  } finally {
    client.release();
  }
});

router.put('/:id/estado', async (req, res) => {
  const orderId = Number(req.params.id);
  const requestedState = req.body.estado;
  if (!isPositiveId(orderId)) {
    return res.status(400).json({ error: 'Pedido inválido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      `SELECT id, empresa_id, cliente_id, repartidor_id, estado
       FROM pedidos
       WHERE id = $1 AND empresa_id = $2
       FOR UPDATE`,
      [orderId, req.user.empresa_id]
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    let allowed = false;
    if (req.user.rol === 'cliente') {
      allowed = order.cliente_id === req.user.id
        && order.estado === 'pendiente'
        && requestedState === 'cancelado';
    } else if (req.user.rol === 'repartidor') {
      const ownsOrder = order.repartidor_id === req.user.id;
      allowed = ownsOrder && (
        (order.estado === 'asignado' && requestedState === 'en_camino')
        || (['asignado', 'en_camino'].includes(order.estado)
          && requestedState === 'entregado'
          && !getCompanyModules(req.user.empresa_modulos).logistica)
      );
    } else if (req.user.rol === 'admin') {
      allowed = ['pendiente', 'asignado', 'en_camino'].includes(order.estado)
        && requestedState === 'cancelado';
    }

    if (!allowed) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Cambio de estado no permitido' });
    }

    if (requestedState === 'cancelado') {
      await client.query(
        `UPDATE productos pr
         SET stock = pr.stock + dp.cantidad
         FROM detalle_pedidos dp
         WHERE dp.pedido_id = $1
           AND dp.producto_id = pr.id
           AND pr.empresa_id = $2`,
        [orderId, req.user.empresa_id]
      );
    }

    const result = await client.query(
      `UPDATE pedidos
       SET estado = $1::varchar,
           actualizado_en = CURRENT_TIMESTAMP,
           entregado_en = CASE
             WHEN $1::varchar = 'entregado' THEN CURRENT_TIMESTAMP
             ELSE entregado_en
           END
       WHERE id = $2 AND empresa_id = $3
       RETURNING *`,
      [requestedState, orderId, req.user.empresa_id]
    );
    await client.query('COMMIT');

    emitToAdmins(req, req.user.empresa_id, 'pedido_actualizado', {
      pedidoId: orderId,
      estado: requestedState
    });
    emitToUser(req, order.cliente_id, 'pedido_actualizado', {
      pedidoId: orderId,
      estado: requestedState
    });
    if (requestedState === 'entregado') {
      emitToUser(req, order.cliente_id, 'confirmacion_entrega', { pedidoId: orderId });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cambiando estado del pedido:', error);
    return res.status(500).json({ error: 'No fue posible actualizar el pedido' });
  } finally {
    client.release();
  }
});

router.put('/:id/confirmar', checkRole(['cliente']), async (req, res) => {
  const orderId = Number(req.params.id);
  if (!isPositiveId(orderId)) {
    return res.status(400).json({ error: 'Pedido inválido' });
  }
  try {
    const result = await pool.query(
      `UPDATE pedidos
       SET confirmado = TRUE, actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $1
         AND empresa_id = $2
         AND cliente_id = $3
         AND estado = 'entregado'
       RETURNING id`,
      [orderId, req.user.empresa_id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(409).json({ error: 'El pedido no puede confirmarse' });
    }
    emitToAdmins(req, req.user.empresa_id, 'pedido_confirmado', { pedidoId: orderId });
    return res.json({ message: 'Recepción confirmada' });
  } catch (error) {
    console.error('Error confirmando pedido:', error);
    return res.status(500).json({ error: 'No fue posible confirmar el pedido' });
  }
});

module.exports = router;
