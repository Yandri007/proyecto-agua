const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const env = require('../config/env');
const { verifyPlatformToken } = require('../middleware/platformAuth');

const response = () => ({
  statusCode: 200,
  payload: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.payload = payload; return this; }
});

test('la sesion de una empresa no sirve para administrar la plataforma', async () => {
  const tenantToken = jwt.sign(
    { id: 1, sv: 1 },
    env.jwtSecret,
    { expiresIn: '5m', issuer: 'aquacontrol', audience: 'aquacontrol-web' }
  );
  const res = response();
  let nextCalled = false;
  await verifyPlatformToken({
    headers: { cookie: `${env.platformSessionCookie}=${tenantToken}` }
  }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('la consola acepta solo un token global y un administrador activo', async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({
    rows: [{
      id: 7,
      nombre: 'Propietario',
      email: 'owner@example.com',
      sesion_version: 3,
      debe_cambiar_password: false
    }]
  });
  try {
    const token = jwt.sign(
      { id: 7, sv: 3, kind: 'platform' },
      env.jwtSecret,
      { expiresIn: '5m', issuer: 'aquacontrol', audience: 'aquacontrol-platform' }
    );
    const req = { headers: { cookie: `${env.platformSessionCookie}=${token}` } };
    const res = response();
    let nextCalled = false;
    await verifyPlatformToken(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.platformAdmin.id, 7);
  } finally {
    pool.query = originalQuery;
  }
});
