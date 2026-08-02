const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCookies } = require('../middleware/auth');
const { isAllowedOrigin } = require('../server');
const { normalizeSlug } = require('../utils/tenant');
const { hashToken } = require('../utils/accountTokens');
const { hasTenantAccess } = require('../utils/plans');
const { isValidKushkiWebhook } = require('../routes/billing.routes');
const { getCompanyModules, requireModule } = require('../utils/modules');
const { nextScheduledDate } = require('../utils/recurringOrders');
const { parseDatabaseUrl, databaseConnectionFromEnv } = require('../utils/databaseConnection');
const crypto = require('crypto');

test('parseCookies separa y decodifica cookies sin exponer la sesión', () => {
  assert.deepEqual(
    parseCookies('theme=dark; nombre=Mar%C3%ADa'),
    { theme: 'dark', nombre: 'María' }
  );
});

test('isAllowedOrigin acepta el mismo host', () => {
  assert.equal(
    isAllowedOrigin('http://localhost:3000', 'localhost:3000'),
    true
  );
});

test('isAllowedOrigin rechaza un sitio externo', () => {
  assert.equal(
    isAllowedOrigin('https://sitio-malicioso.example', 'localhost:3000'),
    false
  );
});

test('normalizeSlug produce códigos de empresa estables y seguros', () => {
  assert.equal(normalizeSlug('Agua Rápida Quito S.A.'), 'agua-rapida-quito-s-a');
  assert.equal(normalizeSlug('  DISTRIBUIDORA---CENTRO  '), 'distribuidora-centro');
});

test('hashToken no conserva el token original', () => {
  const token = 'token-secreto-de-prueba';
  const hash = hashToken(token);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, token);
  assert.equal(hash, hashToken(token));
});

test('hasTenantAccess aplica prueba vigente y suscripción activa', () => {
  assert.equal(hasTenantAccess({
    empresa_suscripcion_estado: 'prueba',
    empresa_plan: 'prueba',
    empresa_prueba_hasta: new Date(Date.now() + 60000)
  }), true);
  assert.equal(hasTenantAccess({
    empresa_suscripcion_estado: 'prueba',
    empresa_plan: 'prueba',
    empresa_prueba_hasta: new Date(Date.now() - 60000)
  }), false);
  assert.equal(hasTenantAccess({
    empresa_suscripcion_estado: 'activa',
    empresa_plan: 'basico'
  }), true);
});

test('webhook Kushki exige firma válida, comercio y timestamp reciente', () => {
  const body = { name: 'succesfullCharge', event: { id: 'evt-1' } };
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret = 'firma-webhook-prueba';
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${JSON.stringify(body)}.${timestamp}`)
    .digest('hex');
  assert.equal(isValidKushkiWebhook({
    body,
    signature,
    timestamp,
    merchantId: 'merchant-1',
    expectedMerchantId: 'merchant-1',
    webhookSecret: secret
  }), true);
  assert.equal(isValidKushkiWebhook({
    body,
    signature: `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`,
    timestamp,
    merchantId: 'merchant-1',
    expectedMerchantId: 'merchant-1',
    webhookSecret: secret
  }), false);
});

test('los módulos opcionales conservan valores seguros por empresa', () => {
  assert.deepEqual(getCompanyModules(null), {
    ventas_ruta: true,
    recursos_humanos: false,
    planta: false,
    logistica: false
  });
  assert.deepEqual(getCompanyModules({ planta: true, ventas_ruta: false }), {
    ventas_ruta: false,
    recursos_humanos: false,
    planta: true,
    logistica: false
  });
});

test('requireModule bloquea únicamente el módulo deshabilitado', () => {
  let nextCalled = false;
  const response = {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
  requireModule('planta')({ user: { empresa_modulos: { planta: false } } }, response, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 403);
  assert.equal(response.payload.code, 'MODULE_DISABLED');

  requireModule('ventas_ruta')({ user: { empresa_modulos: null } }, response, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test('las recurrencias mensuales conservan el día preferido tras un mes corto', () => {
  assert.equal(nextScheduledDate('2027-01-31', 'mensual', 31), '2027-02-28');
  assert.equal(nextScheduledDate('2027-02-28', 'mensual', 31), '2027-03-31');
  assert.equal(nextScheduledDate('2027-03-10', 'quincenal', 10), '2027-03-24');
});

test('la conexion PostgreSQL administrada interpreta credenciales codificadas', () => {
  const parsed = parseDatabaseUrl('postgresql://postgres.demo:Clave%40Segura@pooler.example.com:5432/postgres');
  assert.deepEqual(parsed, {
    url: 'postgresql://postgres.demo:Clave%40Segura@pooler.example.com:5432/postgres',
    host: 'pooler.example.com',
    port: 5432,
    user: 'postgres.demo',
    password: 'Clave@Segura',
    database: 'postgres'
  });
  assert.equal(databaseConnectionFromEnv({
    DATABASE_URL: 'postgresql://runtime:runtime@pooler.example.com/postgres',
    DATABASE_DIRECT_URL: 'postgresql://direct:direct@db.example.com/postgres'
  }, { preferDirect: true }).host, 'db.example.com');
});
