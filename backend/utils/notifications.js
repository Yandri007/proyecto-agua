const pool = require('../config/database');

const createNotification = async ({
  client = pool,
  empresaId,
  userId,
  type,
  title,
  message,
  orderId = null,
  routeId = null,
  eventKey = null
}) => {
  const result = await client.query(
    `INSERT INTO notificaciones
      (empresa_id, usuario_id, tipo, titulo, mensaje,
       pedido_id, ruta_id, clave_evento)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (empresa_id, usuario_id, clave_evento)
       WHERE clave_evento IS NOT NULL DO NOTHING
     RETURNING id, usuario_id, tipo, titulo, mensaje, pedido_id,
               ruta_id, leida, creada_en`,
    [empresaId, userId, type, title, message, orderId, routeId, eventKey]
  );
  return result.rows[0] || null;
};

const emitNotifications = (io, notifications) => {
  if (!io) return;
  for (const notification of notifications.filter(Boolean)) {
    io.to(`user:${notification.usuario_id}`).emit('notificacion', notification);
  }
};

module.exports = {
  createNotification,
  emitNotifications
};
