const pool = require('../config/database');
const logger = require('./logger');

const writeAudit = async ({
  client = pool,
  req,
  user = req?.user,
  empresaId = user?.empresa_id,
  action,
  entity,
  entityId = null,
  details = {}
}) => {
  try {
    await client.query(
      `INSERT INTO auditoria
        (empresa_id, usuario_id, accion, entidad, entidad_id,
         detalles, direccion_ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        empresaId || null,
        user?.id || null,
        action,
        entity,
        entityId === null ? null : String(entityId),
        JSON.stringify(details),
        req?.ip || null,
        req?.get?.('user-agent')?.slice(0, 500) || null
      ]
    );
  } catch (error) {
    logger.error('audit_write_failed', { error, action, entity });
  }
};

const auditSuccessfulMutations = (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  res.on('finish', () => {
    if (!req.user || res.statusCode >= 400) return;
    const io = req.app?.get?.('io');
    if (io && req.user.empresa_id) {
      io.to(`empresa:${req.user.empresa_id}`).emit('operacion_actualizada', {
        recurso: req.baseUrl || 'api',
        accion: req.method,
        actorRol: req.user.rol,
        actualizadoEn: new Date().toISOString()
      });
    }
    void writeAudit({
      req,
      action: `${req.method} ${req.baseUrl}${req.route?.path || req.path}`,
      entity: req.baseUrl || 'api',
      details: { status: res.statusCode }
    });
  });
  return next();
};

module.exports = {
  writeAudit,
  auditSuccessfulMutations
};
