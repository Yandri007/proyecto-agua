const pool = require('../config/database');
const { getPlan, hasTenantAccess } = require('./plans');
const logger = require('./logger');

const localDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const formatUtcDate = (date) => date.toISOString().slice(0, 10);
const dateOnly = (value) => value instanceof Date ? formatUtcDate(value) : String(value).slice(0, 10);

const nextScheduledDate = (dateValue, frequency, preferredDay) => {
  const [year, month, day] = dateOnly(dateValue).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (frequency === 'semanal' || frequency === 'quincenal') {
    date.setUTCDate(date.getUTCDate() + (frequency === 'semanal' ? 7 : 14));
    return formatUtcDate(date);
  }

  const targetMonth = month === 12 ? 0 : month;
  const targetYear = month === 12 ? year + 1 : year;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return formatUtcDate(new Date(Date.UTC(targetYear, targetMonth, Math.min(preferredDay, lastDay))));
};

const recordFailure = async (client, schedule, errorMessage) => {
  const nextDate = nextScheduledDate(
    schedule.proxima_entrega,
    schedule.frecuencia,
    Number(schedule.dia_mes)
  );
  await client.query(
    `INSERT INTO ejecuciones_pedidos_recurrentes
      (pedido_recurrente_id, fecha_programada, estado, error)
     VALUES ($1, $2, 'error', $3)
     ON CONFLICT (pedido_recurrente_id, fecha_programada) DO NOTHING`,
    [schedule.id, schedule.proxima_entrega, errorMessage]
  );
  await client.query(
    `UPDATE pedidos_recurrentes
     SET proxima_entrega = $1, ultima_generacion = $2, ultimo_error = $3,
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id = $4`,
    [nextDate, schedule.proxima_entrega, errorMessage, schedule.id]
  );
  return { scheduleId: schedule.id, status: 'error', error: errorMessage };
};

const processSchedule = async (scheduleId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const scheduleResult = await client.query(
      `SELECT pr.*, e.plan AS empresa_plan,
              e.suscripcion_estado AS empresa_suscripcion_estado,
              e.prueba_hasta AS empresa_prueba_hasta,
              e.periodo_hasta AS empresa_periodo_hasta
       FROM pedidos_recurrentes pr
       JOIN empresas e ON e.id = pr.empresa_id
       WHERE pr.id = $1 FOR UPDATE OF pr`,
      [scheduleId]
    );
    const schedule = scheduleResult.rows[0];
    if (!schedule || schedule.estado !== 'activo'
        || dateOnly(schedule.proxima_entrega) > localDate()) {
      await client.query('ROLLBACK');
      return { scheduleId, status: 'ignored' };
    }

    if (!hasTenantAccess(schedule)) {
      await client.query(
        `UPDATE pedidos_recurrentes SET ultimo_error = $1, actualizado_en = CURRENT_TIMESTAMP WHERE id = $2`,
        ['La suscripción de la empresa requiere atención', schedule.id]
      );
      await client.query('COMMIT');
      return { scheduleId, status: 'blocked' };
    }

    const existing = await client.query(
      `SELECT pedido_id, estado FROM ejecuciones_pedidos_recurrentes
       WHERE pedido_recurrente_id = $1 AND fecha_programada = $2`,
      [schedule.id, schedule.proxima_entrega]
    );
    if (existing.rowCount) {
      const nextDate = nextScheduledDate(
        schedule.proxima_entrega,
        schedule.frecuencia,
        Number(schedule.dia_mes)
      );
      await client.query(
        `UPDATE pedidos_recurrentes SET proxima_entrega = $1,
                ultima_generacion = $2, actualizado_en = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [nextDate, schedule.proxima_entrega, schedule.id]
      );
      await client.query('COMMIT');
      return { scheduleId, status: 'duplicate', orderId: existing.rows[0].pedido_id };
    }

    const plan = schedule.empresa_plan === 'prueba'
      ? getPlan('profesional')
      : getPlan(schedule.empresa_plan);
    if (plan.limits.monthlyOrders !== null) {
      const usage = await client.query(
        `SELECT COUNT(*)::INT AS total FROM pedidos
         WHERE empresa_id = $1 AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
        [schedule.empresa_id]
      );
      if (usage.rows[0].total >= plan.limits.monthlyOrders) {
        const failure = await recordFailure(client, schedule, 'Límite mensual del plan alcanzado');
        await client.query('COMMIT');
        return failure;
      }
    }

    const details = await client.query(
      `SELECT d.producto_id, d.cantidad, p.nombre, p.precio, p.stock, p.activo,
              p.es_retornable, p.deposito_envase
       FROM detalle_pedidos_recurrentes d
       JOIN productos p ON p.id = d.producto_id AND p.empresa_id = $2
       WHERE d.pedido_recurrente_id = $1
       ORDER BY d.id FOR UPDATE OF p`,
      [schedule.id, schedule.empresa_id]
    );
    if (!details.rowCount) {
      const failure = await recordFailure(client, schedule, 'La programación no tiene productos disponibles');
      await client.query('COMMIT');
      return failure;
    }

    let total = 0;
    for (const item of details.rows) {
      if (!item.activo || Number(item.stock) < Number(item.cantidad)) {
        const failure = await recordFailure(
          client,
          schedule,
          !item.activo
            ? `${item.nombre} ya no está disponible`
            : `Stock insuficiente para ${item.nombre}`
        );
        await client.query('COMMIT');
        return failure;
      }
      total += Number(item.precio) * Number(item.cantidad);
    }
    total = Number(total.toFixed(2));

    const orderResult = await client.query(
      `INSERT INTO pedidos
        (empresa_id, cliente_id, total, subtotal_productos, deposito_envases,
         metodo_pago, direccion_entrega, latitud_entrega, longitud_entrega,
         estado, pedido_recurrente_id, fecha_programada)
       VALUES ($1, $2, $3, $3, 0, $4, $5, $6, $7, 'pendiente', $8, $9)
       RETURNING *`,
      [schedule.empresa_id, schedule.cliente_id, total, schedule.metodo_pago,
        schedule.direccion_entrega, schedule.latitud_entrega, schedule.longitud_entrega,
        schedule.id, schedule.proxima_entrega]
    );
    const order = orderResult.rows[0];
    for (const item of details.rows) {
      await client.query(
        `INSERT INTO detalle_pedidos
          (pedido_id, producto_id, cantidad, precio_unitario, es_retornable, deposito_unitario)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, item.producto_id, item.cantidad, item.precio,
          item.es_retornable, item.es_retornable ? item.deposito_envase : 0]
      );
      await client.query(
        `UPDATE productos SET stock = stock - $1
         WHERE id = $2 AND empresa_id = $3`,
        [item.cantidad, item.producto_id, schedule.empresa_id]
      );
    }

    await client.query(
      `INSERT INTO ejecuciones_pedidos_recurrentes
        (pedido_recurrente_id, fecha_programada, pedido_id, estado)
       VALUES ($1, $2, $3, 'generado')`,
      [schedule.id, schedule.proxima_entrega, order.id]
    );
    const nextDate = nextScheduledDate(
      schedule.proxima_entrega,
      schedule.frecuencia,
      Number(schedule.dia_mes)
    );
    await client.query(
      `UPDATE pedidos_recurrentes
       SET proxima_entrega = $1, ultima_generacion = $2, ultimo_error = NULL,
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [nextDate, schedule.proxima_entrega, schedule.id]
    );
    await client.query('COMMIT');
    return { scheduleId: schedule.id, status: 'generated', order };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('recurring_order_generation_failed', { error, scheduleId });
    return { scheduleId, status: 'failed', error: error.message };
  } finally {
    client.release();
  }
};

const generateDueRecurringOrders = async ({ scheduleId = null, companyId = null, limit = 100 } = {}) => {
  await pool.query(
    `UPDATE pedidos_recurrentes
     SET estado = 'activo', proxima_entrega = GREATEST(proxima_entrega, pausado_hasta),
         pausado_hasta = NULL, actualizado_en = CURRENT_TIMESTAMP
     WHERE estado = 'pausado' AND pausado_hasta IS NOT NULL
       AND pausado_hasta <= $1::date
       AND ($2::bigint IS NULL OR id = $2)
       AND ($3::int IS NULL OR empresa_id = $3)`,
    [localDate(), scheduleId, companyId]
  );
  const due = await pool.query(
    `SELECT id FROM pedidos_recurrentes
     WHERE estado = 'activo' AND proxima_entrega <= $1::date
       AND ($2::bigint IS NULL OR id = $2)
       AND ($3::int IS NULL OR empresa_id = $3)
     ORDER BY proxima_entrega, id LIMIT $4`,
    [localDate(), scheduleId, companyId, Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );
  const results = [];
  for (const schedule of due.rows) {
    results.push(await processSchedule(schedule.id));
  }
  return results;
};

module.exports = {
  generateDueRecurringOrders,
  localDate,
  nextScheduledDate
};
