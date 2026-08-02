const database = require('../config/database');

const run = async () => {
  try {
    await database.initializeDatabase();
    const result = await database.query('SELECT current_database() AS database, CURRENT_TIMESTAMP AS checked_at');
    console.log(`PostgreSQL preparado: ${result.rows[0].database}`);
  } finally {
    await database.end();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
