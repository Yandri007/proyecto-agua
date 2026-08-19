const syncRouteStopForOrder = async ({ client, empresaId, orderId, orderState }) => {
  const stopState = orderState === 'entregado'
    ? 'entregada'
    : orderState === 'cancelado'
      ? 'cancelada'
      : null;
  if (!stopState) return [];

  const stops = await client.query(
    `UPDATE paradas_ruta
     SET estado = $1,
         completada_en = CURRENT_TIMESTAMP,
         actualizada_en = CURRENT_TIMESTAMP
     WHERE empresa_id = $2
       AND pedido_id = $3
       AND estado IN ('pendiente', 'en_camino')
     RETURNING ruta_id`,
    [stopState, empresaId, orderId]
  );
  const routeIds = [...new Set(stops.rows.map((row) => Number(row.ruta_id)))];
  for (const routeId of routeIds) {
    await client.query(
      `UPDATE rutas_entrega r
       SET estado = 'completada',
           completada_en = CURRENT_TIMESTAMP,
           actualizada_en = CURRENT_TIMESTAMP
       WHERE r.id = $1 AND r.empresa_id = $2
         AND r.estado IN ('planificada', 'en_curso')
         AND NOT EXISTS (
           SELECT 1 FROM paradas_ruta pr
           WHERE pr.ruta_id = r.id AND pr.estado IN ('pendiente', 'en_camino')
         )`,
      [routeId, empresaId]
    );
  }
  return routeIds;
};

module.exports = {
  syncRouteStopForOrder
};
