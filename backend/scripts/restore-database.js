const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { findPostgresTool } = require('../utils/postgresTools');
const { databaseConnectionFromEnv } = require('../utils/databaseConnection');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const inputFile = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (process.env.ALLOW_DATABASE_RESTORE !== 'true') {
  console.error('Define ALLOW_DATABASE_RESTORE=true para autorizar una restauración.');
  process.exit(1);
}
if (!inputFile || !fs.existsSync(inputFile)) {
  console.error('Indica un archivo .dump existente.');
  process.exit(1);
}
const connection = databaseConnectionFromEnv(process.env, { preferDirect: true });

const args = [
  '--clean',
  '--if-exists',
  '--no-owner',
  '--no-acl',
  `--host=${connection.host}`,
  `--port=${connection.port}`,
  `--username=${connection.user}`,
  `--dbname=${connection.database}`,
  inputFile
];

const child = spawn(findPostgresTool('pg_restore', process.env.PG_RESTORE_PATH), args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    PGPASSWORD: connection.password,
    PGSSLMODE: process.env.DB_SSL === 'true' ? 'require' : 'prefer'
  },
  windowsHide: true
});

let spawnFailed = false;
child.on('error', (error) => {
  spawnFailed = true;
  console.error(`No fue posible ejecutar pg_restore: ${error.message}`);
  process.exitCode = 1;
});
child.on('close', (code) => {
  if (spawnFailed) return;
  process.exitCode = code || 0;
});
