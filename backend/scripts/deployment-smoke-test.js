const assert = require('node:assert/strict');
const { io } = require('socket.io-client');

const baseUrl = String(process.env.DEPLOYMENT_URL || '').replace(/\/+$/, '');
const email = process.env.STAGING_TEST_EMAIL || '';
const password = process.env.STAGING_TEST_PASSWORD || '';
const allowInsecureLocal = process.env.ALLOW_INSECURE_LOCAL_DEPLOYMENT_TEST === 'true'
  && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl);

if (!baseUrl.startsWith('https://') && !allowInsecureLocal) {
  throw new Error('Define DEPLOYMENT_URL con la URL HTTPS del staging');
}

const get = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: 'error',
    cache: 'no-store',
    ...options
  });
  return response;
};

const verifyHtml = async (path) => {
  const response = await get(path);
  const html = await response.text();
  const csp = response.headers.get('content-security-policy') || '';
  const nonce = html.match(/<script\s+nonce="([^"]+)"/)?.[1];
  assert.equal(response.status, 200, `${path} devolvio HTTP ${response.status}`);
  assert.ok(nonce, `${path} no contiene nonce CSP`);
  assert.ok(csp.includes(`'nonce-${nonce}'`), `${path} no coincide con la CSP`);
  assert.ok(!html.includes('{{CSP_NONCE}}'), `${path} expuso el marcador CSP`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(response.headers.get('x-frame-options'), `${path} no protege contra iframes`);
  assert.ok(response.headers.get('referrer-policy'), `${path} no define Referrer-Policy`);
  if (!allowInsecureLocal) {
    assert.match(
      response.headers.get('strict-transport-security') || '',
      /max-age=31536000/i,
      `${path} no exige HTTPS con HSTS`
    );
  }
  return nonce;
};

const verifyAuthenticatedSession = async () => {
  if (!email || !password) {
    console.log('Sesion y Socket.IO omitidos: no se definieron credenciales de staging');
    return;
  }
  const login = await get('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: baseUrl
    },
    body: JSON.stringify({ email, password })
  });
  const data = await login.json();
  assert.equal(login.status, 200, data.error || 'El login de staging fallo');
  const rawCookie = login.headers.getSetCookie?.()[0] || login.headers.get('set-cookie') || '';
  const cookie = rawCookie.split(';')[0];
  assert.ok(cookie, 'El login no devolvio la cookie de sesion');
  if (!allowInsecureLocal) {
    assert.match(rawCookie, /;\s*Secure/i, 'La cookie publica debe usar Secure');
  }
  assert.match(rawCookie, /;\s*HttpOnly/i, 'La cookie publica debe usar HttpOnly');
  assert.match(rawCookie, /;\s*SameSite=Strict/i, 'La cookie publica debe usar SameSite=Strict');

  const me = await get('/api/auth/me', { headers: { Cookie: cookie } });
  assert.equal(me.status, 200, 'La sesion autenticada no fue aceptada');

  const socket = io(baseUrl, {
    transports: ['websocket'],
    extraHeaders: { Cookie: cookie }
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket.IO no conecto en staging')), 10000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  socket.disconnect();
  console.log(`Sesion y Socket.IO verificados para el rol ${data.user.rol}`);
};

const run = async () => {
  const health = await get('/api/health');
  const healthData = await health.json();
  assert.equal(health.status, 200);
  assert.equal(healthData.status, 'ok');

  const nonces = new Set();
  for (const path of ['/', '/admin/', '/cliente/app.html', '/repartidor/', '/equipo/']) {
    nonces.add(await verifyHtml(path));
  }
  assert.equal(nonces.size, 5, 'Los documentos deben recibir nonces independientes');

  for (const path of [
    '/assets/aquacontrol-ui.css',
    '/assets/safe-ui.js',
    '/vendor/leaflet/leaflet.js',
    '/vendor/chartjs/chart.umd.min.js',
    '/assets/vendor/xlsx-0.20.2.full.min.js'
  ]) {
    const response = await get(path);
    assert.equal(response.status, 200, `${path} no esta disponible`);
  }

  const anonymousSession = await get('/api/auth/me');
  assert.equal(anonymousSession.status, 401, 'La API acepto una sesion anonima');
  await verifyAuthenticatedSession();
  console.log(`Staging verificado correctamente en ${baseUrl}`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
