const APP_PUBLIC_TABLES = Object.freeze([
  'empresas',
  'administradores_plataforma',
  'auditoria_plataforma',
  'usuarios',
  'direcciones_clientes',
  'productos',
  'pedidos',
  'detalle_pedidos',
  'pedidos_recurrentes',
  'detalle_pedidos_recurrentes',
  'ejecuciones_pedidos_recurrentes',
  'ubicaciones_repartidores',
  'tokens_usuarios',
  'auditoria',
  'eventos_suscripcion',
  'perfiles_empleados',
  'ventas_ruta',
  'detalle_ventas_ruta',
  'vehiculos',
  'inventario_vehiculos',
  'movimientos_inventario_vehiculos',
  'movimientos_envases',
  'comprobantes_entrega',
  'cierres_ruta',
  'lotes_produccion'
]);

const DATA_API_ROLES = Object.freeze(['anon', 'authenticated', 'service_role']);

const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`;
const qualifiedTable = (table) => `public.${quoteIdentifier(table)}`;

const existingDataApiRoles = async (client) => {
  const result = await client.query(
    `SELECT rolname
     FROM pg_roles
     WHERE rolname = ANY($1::text[])
     ORDER BY rolname`,
    [DATA_API_ROLES]
  );
  return result.rows.map((row) => row.rolname);
};

const auditPublicSchemaSecurity = async (client) => {
  const tables = await client.query(
    `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND c.relname = ANY($1::text[])
     ORDER BY c.relname`,
    [APP_PUBLIC_TABLES]
  );
  const found = new Set(tables.rows.map((row) => row.table_name));
  const missingTables = APP_PUBLIC_TABLES.filter((table) => !found.has(table));
  const rlsDisabled = tables.rows
    .filter((row) => !row.rls_enabled)
    .map((row) => row.table_name);
  const roles = await existingDataApiRoles(client);
  const exposedPrivileges = [];

  for (const role of roles.filter((item) => item !== 'service_role')) {
    for (const table of APP_PUBLIC_TABLES) {
      const privilege = await client.query(
        `SELECT has_table_privilege($1, $2, 'SELECT, INSERT, UPDATE, DELETE') AS exposed`,
        [role, qualifiedTable(table)]
      );
      if (privilege.rows[0]?.exposed) exposedPrivileges.push(`${role}:${table}`);
    }
  }

  return {
    tableCount: tables.rowCount,
    missingTables,
    rlsDisabled,
    exposedPrivileges,
    dataApiRoles: roles
  };
};

const hardenPublicSchema = async (client) => {
  for (const table of APP_PUBLIC_TABLES) {
    await client.query(`ALTER TABLE ${qualifiedTable(table)} ENABLE ROW LEVEL SECURITY`);
  }

  const roles = await existingDataApiRoles(client);
  for (const role of roles) {
    const quotedRole = quoteIdentifier(role);
    for (const table of APP_PUBLIC_TABLES) {
      await client.query(
        `REVOKE ALL PRIVILEGES ON TABLE ${qualifiedTable(table)} FROM ${quotedRole}`
      );
    }
    await client.query(
      `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${quotedRole}`
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public
       REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM ${quotedRole}`
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public
       REVOKE USAGE, SELECT ON SEQUENCES FROM ${quotedRole}`
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public
       REVOKE EXECUTE ON FUNCTIONS FROM ${quotedRole}`
    );
  }
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`
  );

  const audit = await auditPublicSchemaSecurity(client);
  if (audit.missingTables.length || audit.rlsDisabled.length || audit.exposedPrivileges.length) {
    throw new Error(`La proteccion RLS no pudo verificarse: ${JSON.stringify(audit)}`);
  }
  return audit;
};

module.exports = {
  APP_PUBLIC_TABLES,
  auditPublicSchemaSecurity,
  hardenPublicSchema
};
