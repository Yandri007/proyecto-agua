const assert = require('node:assert/strict');
require('../config/env');

const baseUrl = (process.env.TEST_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const requests = Math.max(20, Math.min(2000, Number(process.env.LOAD_TEST_REQUESTS || 120)));
const concurrency = Math.max(1, Math.min(50, Number(process.env.LOAD_TEST_CONCURRENCY || 10)));
const email = process.env.LOAD_TEST_EMAIL || 'demo.cliente@aquacontrol.com';
const password = process.env.LOAD_TEST_PASSWORD || process.env.DEMO_USER_PASSWORD;
if (!password) {
  throw new Error('Set LOAD_TEST_PASSWORD or DEMO_USER_PASSWORD in backend/.env');
}

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl) && process.env.ALLOW_LOAD_TEST !== 'true') {
  throw new Error('Define ALLOW_LOAD_TEST=true para ejecutar contra un host remoto autorizado');
}

const percentile = (values, value) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)];
};

const run = async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({ email, password })
  });
  const loginData = await login.json();
  assert.equal(login.status, 200, loginData.error || 'No fue posible iniciar la prueba');
  assert.equal(loginData.user.rol, 'cliente', 'La cuenta de carga debe tener rol cliente');
  const rawCookie = login.headers.getSetCookie?.()[0] || login.headers.get('set-cookie') || '';
  const cookie = rawCookie.split(';')[0];
  assert.ok(cookie, 'El inicio de sesión no devolvió cookie');

  const paths = ['/', '/api/health', '/api/productos', '/api/pedidos/mis-pedidos'];
  const durations = [];
  const failures = [];
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= requests) return;
      const requestPath = paths[index % paths.length];
      const startedAt = performance.now();
      try {
        const response = await fetch(`${baseUrl}${requestPath}`, {
          headers: { Cookie: cookie },
          cache: 'no-store'
        });
        durations.push(performance.now() - startedAt);
        if (!response.ok) failures.push(`${requestPath}: HTTP ${response.status}`);
        await response.arrayBuffer();
      } catch (error) {
        failures.push(`${requestPath}: ${error.message}`);
      }
    }
  };

  const startedAt = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsed = performance.now() - startedAt;
  assert.deepEqual(failures, [], failures.slice(0, 10).join('\n'));

  console.log(`Carga local aprobada: ${requests} solicitudes, concurrencia ${concurrency}`);
  console.log(`Rendimiento: ${(requests / (elapsed / 1000)).toFixed(1)} req/s, p95 ${percentile(durations, 0.95).toFixed(0)} ms, máximo ${Math.max(...durations).toFixed(0)} ms`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
