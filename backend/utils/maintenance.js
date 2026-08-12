const pool = require('../config/database');
const env = require('../config/env');
const logger = require('./logger');
const { generateDueRecurringOrders } = require('./recurringOrders');

const runMaintenance = async () => {
  const client = await pool.connect();
  try {
    let recurringResults = [];
    try {
      recurringResults = await generateDueRecurringOrders();
    } catch (error) {
      logger.error('recurring_orders_maintenance_failed', { error });
    }
    await client.query('BEGIN');
    const locations = await client.query(
      `DELETE FROM ubicaciones_repartidores ur
       USING pedidos p
       WHERE p.id = ur.pedido_id
         AND p.estado IN ('entregado', 'cancelado')
         AND p.actualizado_en < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')`,
      [env.locationRetentionDays]
    );
    const tokens = await client.query(
      `DELETE FROM tokens_usuarios
       WHERE expira_en < CURRENT_TIMESTAMP - INTERVAL '7 days'
          OR usado_en < CURRENT_TIMESTAMP - INTERVAL '7 days'`
    );
    const audits = await client.query(
      `DELETE FROM auditoria
       WHERE creado_en < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')`,
      [env.auditRetentionDays]
    );
    const platformAudits = await client.query(
      `DELETE FROM auditoria_plataforma
       WHERE creado_en < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')`,
      [env.auditRetentionDays]
    );
    await client.query('COMMIT');
    logger.info('maintenance_completed', {
      deletedLocations: locations.rowCount,
      deletedTokens: tokens.rowCount,
      deletedAudits: audits.rowCount,
      deletedPlatformAudits: platformAudits.rowCount,
      recurringOrdersGenerated: recurringResults.filter((item) => item.status === 'generated').length,
      recurringOrdersWithError: recurringResults.filter((item) => item.status === 'error' || item.status === 'failed').length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('maintenance_failed', { error });
  } finally {
    client.release();
  }
};

const scheduleMaintenance = () => {
  void runMaintenance();
  const interval = setInterval(() => void runMaintenance(), 24 * 60 * 60 * 1000);
  interval.unref();
  return interval;
};

module.exports = {
  runMaintenance,
  scheduleMaintenance
};
