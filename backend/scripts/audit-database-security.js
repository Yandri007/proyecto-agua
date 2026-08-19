const pool = require('../config/database');
const { auditPublicSchemaSecurity } = require('../utils/databaseSecurity');

const run = async () => {
  try {
    await pool.initializeDatabase();
    const audit = await auditPublicSchemaSecurity(pool);
    if (audit.missingTables.length || audit.rlsDisabled.length || audit.exposedPrivileges.length) {
      throw new Error(`Auditoria de base de datos rechazada: ${JSON.stringify(audit)}`);
    }
    console.log(
      `Seguridad PostgreSQL verificada: ${audit.tableCount} tablas con RLS y sin acceso Data API publico`
    );
  } finally {
    await pool.end();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
