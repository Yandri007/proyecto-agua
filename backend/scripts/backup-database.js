const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { findPostgresTool } = require('../utils/postgresTools');
const { databaseConnectionFromEnv } = require('../utils/databaseConnection');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const backupDirectory = path.resolve(
  __dirname,
  '..',
  process.env.BACKUP_DIR || 'backups'
);
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 14);
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(backupDirectory, `aquacontrol-${timestamp}.dump`);
const connection = databaseConnectionFromEnv(process.env, { preferDirect: true });

fs.mkdirSync(backupDirectory, { recursive: true });

const args = [
  '--format=custom',
  '--no-owner',
  '--no-acl',
  `--file=${backupFile}`,
  `--host=${connection.host}`,
  `--port=${connection.port}`,
  `--username=${connection.user}`,
  connection.database
];

const child = spawn(findPostgresTool('pg_dump', process.env.PG_DUMP_PATH), args, {
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
  console.error(`No fue posible ejecutar pg_dump: ${error.message}`);
  process.exitCode = 1;
});

child.on('close', (code) => {
  if (spawnFailed) return;
  if (code !== 0) {
    console.error(`El respaldo terminó con código ${code}`);
    process.exitCode = code || 1;
    return;
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const entry of fs.readdirSync(backupDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.dump')) continue;
    const fullPath = path.join(backupDirectory, entry.name);
    if (fs.statSync(fullPath).mtimeMs < cutoff) {
      fs.unlinkSync(fullPath);
    }
  }
  console.log(`Respaldo creado: ${backupFile}`);
});
