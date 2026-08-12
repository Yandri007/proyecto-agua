const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const env = require('../config/env');
const platformRoutes = require('../routes/platform.routes');

test('la activacion piloto exige confirmacion y no audita el enlace secreto', async () => {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  let auditDetails;
  let tokensInvalidated = false;

  const platformAdmin = {
    id: 9,
    nombre: 'Propietario',
    email: 'owner@example.com',
    sesion_version: 2,
    debe_cambiar_password: false,
    ultimo_acceso_en: null
  };
  const pilotUser = {
    id: 41,
    nombre: 'Cliente Piloto',
    email: 'piloto@example.com',
    telefono: '0990000000',
    rol: 'cliente',
    creado_en: new Date().toISOString(),
    empresa_id: 17,
    empresa: 'Agua Piloto',
    empresa_slug: 'agua-piloto',
    empresa_estado: 'activa'
  };

  pool.query = async (sql) => {
    if (sql.includes('FROM administradores_plataforma')) return { rows: [platformAdmin] };
    if (sql.includes('FROM usuarios u')) return { rows: [pilotUser] };
    throw new Error(`Consulta global inesperada: ${sql}`);
  };
  pool.connect = async () => ({
    async query(sql, params = []) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('SELECT u.id') && sql.includes('FOR UPDATE OF u')) return { rows: [pilotUser] };
      if (sql.includes('UPDATE tokens_usuarios')) {
        tokensInvalidated = true;
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO tokens_usuarios')) return { rows: [] };
      if (sql.includes('INSERT INTO auditoria_plataforma')) {
        auditDetails = JSON.parse(params[2]);
        return { rows: [] };
      }
      throw new Error(`Consulta transaccional inesperada: ${sql}`);
    },
    release() {}
  });

  const app = express();
  app.use(express.json());
  app.use('/api/platform', platformRoutes);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const port = server.address().port;
    const token = jwt.sign(
      { id: platformAdmin.id, sv: platformAdmin.sesion_version, kind: 'platform' },
      env.jwtSecret,
      { expiresIn: '5m', issuer: 'aquacontrol', audience: 'aquacontrol-platform' }
    );
    const headers = {
      Cookie: `${env.platformSessionCookie}=${token}`,
      'Content-Type': 'application/json'
    };

    let response = await fetch(`http://127.0.0.1:${port}/api/platform/pilot-users` , { headers });
    assert.equal(response.status, 200);
    assert.equal((await response.json())[0].email, pilotUser.email);
    assert.match(response.headers.get('cache-control'), /no-store/);

    response = await fetch(`http://127.0.0.1:${port}/api/platform/pilot-users/${pilotUser.id}/access-link`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ identity_confirmed: false, channel: 'whatsapp' })
    });
    assert.equal(response.status, 400);

    response = await fetch(`http://127.0.0.1:${port}/api/platform/pilot-users/${pilotUser.id}/access-link`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ identity_confirmed: true, channel: 'whatsapp' })
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    const accessUrl = new URL(result.access_url);
    const resetToken = accessUrl.searchParams.get('reset_token');
    assert.equal(result.expires_in_minutes, 60);
    assert.ok(resetToken.length >= 20);
    assert.equal(tokensInvalidated, true);
    assert.equal(auditDetails.usuario_id, pilotUser.id);
    assert.equal(auditDetails.canal_confirmacion, 'whatsapp');
    assert.equal(JSON.stringify(auditDetails).includes(resetToken), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
    pool.connect = originalConnect;
  }
});
