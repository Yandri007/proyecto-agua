const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const pool = require('../config/database');
const { APP_PUBLIC_TABLES, auditPublicSchemaSecurity } = require('../utils/databaseSecurity');

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const testIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
const password = `Prueba-Segura-${unique}`;
const newPassword = `Nueva-Prueba-${unique}`;
const primarySlug = `prueba-${unique}`.slice(0, 80);
const secondarySlug = `aislamiento-${unique}`.slice(0, 80);
const companyIds = [];
let adminCookie;
let clientCookie;
let driverCookie;
let driverId;
let orderId;
let additionalOrderId;
let routeSaleId;
let batchId;
let vehicleId;
let closingId;
let deliveryOrderId;
let incidentOrderId;
let deliveryRouteId;
let recurringScheduleId;
let recurringOrderId;
let savedAddressId;
let cancelled = false;
let additionalOrderCancelled = false;
const liveSockets = [];

const request = async (path, options = {}, cookie = null) => {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    Origin: baseUrl,
    'X-Forwarded-For': testIp,
    ...options.headers
  };
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const data = await response.json();
  return { response, data };
};

const requestRaw = (path, options = {}, cookie = null) => fetch(`${baseUrl}${path}`, {
  ...options,
  headers: {
    ...(cookie ? { Cookie: cookie } : {}),
    Origin: baseUrl,
    'X-Forwarded-For': testIp,
    ...options.headers
  }
});

const connectSocket = async (cookie) => {
  const socket = io(baseUrl, {
    transports: ['websocket'],
    extraHeaders: { Cookie: cookie }
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket.IO no conectó a tiempo')), 5000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  liveSockets.push(socket);
  return socket;
};

const waitForSocketEvent = (socket, event, predicate = () => true) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    socket.off(event, handler);
    reject(new Error(`No se recibió el evento ${event}`));
  }, 5000);
  const handler = (data) => {
    if (!predicate(data)) return;
    clearTimeout(timeout);
    socket.off(event, handler);
    resolve(data);
  };
  socket.on(event, handler);
});

const tokenFromUrl = (url, name) => {
  assert.ok(url, `Falta el enlace de desarrollo para ${name}`);
  return new URL(url).searchParams.get(name);
};

const verifyEmail = async (developmentUrl) => {
  const result = await request('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({
      token: tokenFromUrl(developmentUrl, 'verify_token')
    })
  });
  assert.equal(result.response.status, 200);
};

const login = async (email, loginPassword) => {
  const result = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: loginPassword })
  });
  assert.equal(result.response.status, 200);
  return {
    cookie: result.response.headers.get('set-cookie').split(';')[0],
    user: result.data.user
  };
};

const createCompany = async (slug, suffix) => {
  const email = `admin-${suffix}-${unique}@example.com`;
  let result = await request('/api/auth/register-empresa', {
    method: 'POST',
    body: JSON.stringify({
      empresa_nombre: `Distribuidora de Prueba ${suffix}`,
      empresa_slug: slug,
      nombre: `Administrador ${suffix}`,
      email,
      password,
      telefono: '0999999999'
    })
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.requires_email_verification, true);

  result = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.data.code, 'EMAIL_NOT_VERIFIED');

  await verifyEmail(result.data.development_url || (await request('/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email })
  })).data.development_url);
  const session = await login(email, password);
  assert.equal(session.user.rol, 'admin');
  assert.equal(session.user.empresa.slug, slug);
  companyIds.push(session.user.empresa.id);
  return session;
};

const run = async () => {
  try {
    const databaseSecurity = await auditPublicSchemaSecurity(pool);
    assert.equal(databaseSecurity.tableCount, APP_PUBLIC_TABLES.length);
    assert.deepEqual(databaseSecurity.missingTables, []);
    assert.deepEqual(databaseSecurity.rlsDisabled, []);
    assert.deepEqual(databaseSecurity.exposedPrivileges, []);

    const htmlNonces = new Set();
    for (const path of ['/', '/admin/', '/cliente/app.html', '/repartidor/', '/equipo/']) {
      const response = await fetch(`${baseUrl}${path}`);
      const html = await response.text();
      const header = response.headers.get('content-security-policy') || '';
      const htmlNonce = html.match(/<script\s+nonce="([^"]+)"/)?.[1];
      assert.equal(response.status, 200, `${path} no cargó correctamente`);
      assert.ok(htmlNonce, `${path} no recibió nonce CSP`);
      assert.ok(header.includes(`'nonce-${htmlNonce}'`), `${path} no coincide con su cabecera CSP`);
      assert.ok(!header.includes("script-src 'self' 'unsafe-inline'"), `${path} permite scripts inline inseguros`);
      assert.ok(!html.includes('{{CSP_NONCE}}'), `${path} expuso el marcador CSP sin procesar`);
      htmlNonces.add(htmlNonce);
    }
    assert.equal(htmlNonces.size, 5, 'Cada documento HTML debe recibir un nonce independiente');

    const rejectedOrigin = await request('/api/auth/login', {
      method: 'POST',
      headers: { Origin: 'https://sitio-malicioso.example' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'invalid-password' })
    });
    assert.equal(rejectedOrigin.response.status, 403);

    const primary = await createCompany(primarySlug, 'principal');
    adminCookie = primary.cookie;

    let result = await request('/api/auth/empresa', {}, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.plan, 'prueba');

    result = await request('/api/billing/config', {}, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.provider, 'kushki');

    result = await request('/api/productos', {}, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.length, 4);
    const product = result.data[0];
    const stockBefore = Number(product.stock);
    const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    result = await request('/api/branding', {
      method: 'PUT',
      body: JSON.stringify({ nombre: 'Agua Principal Personalizada' })
    }, adminCookie);
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.nombre, 'Agua Principal Personalizada');

    result = await request('/api/branding/logo', {
      method: 'PUT',
      body: JSON.stringify({ image: testImage })
    }, adminCookie);
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    assert.ok(result.data.logo_url);

    let imageResponse = await requestRaw('/api/branding/logo', {}, adminCookie);
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get('content-type'), 'image/png');

    result = await request(`/api/productos/${product.id}/imagen`, {
      method: 'PUT',
      body: JSON.stringify({ image: testImage })
    }, adminCookie);
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    assert.ok(result.data.imagen_url);

    imageResponse = await requestRaw(`/api/productos/${product.id}/imagen`, {}, adminCookie);
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get('content-type'), 'image/png');

    result = await request(`/api/productos/${product.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: product.nombre,
        tipo: product.tipo,
        precio: Number(product.precio),
        stock: stockBefore,
        stock_minimo: Number(product.stock_minimo),
        es_retornable: true,
        deposito_envase: 1.5
      })
    }, adminCookie);
    assert.equal(result.response.status, 200);

    result = await request('/api/organizacion/config', {}, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.modulos.ventas_ruta, true);
    assert.equal(result.data.modulos.recursos_humanos, false);
    assert.equal(result.data.modulos.logistica, false);

    result = await request('/api/organizacion/config', {
      method: 'PUT',
      body: JSON.stringify({ recursos_humanos: true, planta: true, logistica: true })
    }, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.modulos.planta, true);

    const driverEmail = `repartidor-${unique}@example.com`;
    result = await request('/api/auth/repartidores', {
      method: 'POST',
      body: JSON.stringify({
        nombre: 'Repartidor Prueba',
        email: driverEmail,
        password,
        telefono: '0977777777'
      })
    }, adminCookie);
    assert.equal(result.response.status, 201, JSON.stringify(result.data));
    assert.equal(typeof result.data.email_sent, 'boolean');
    assert.equal(new URL(result.data.activation_url).searchParams.has('verify_token'), true);
    driverId = result.data.id;

    result = await request(`/api/auth/repartidores/${driverId}/resend-verification`, {
      method: 'POST'
    }, adminCookie);
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    assert.equal(typeof result.data.email_sent, 'boolean');
    assert.equal(new URL(result.data.activation_url).searchParams.has('verify_token'), true);
    await verifyEmail(result.data.activation_url);

    result = await request('/api/logistica/vehiculos', {
      method: 'POST',
      body: JSON.stringify({ placa: 'PBA-1234', nombre: 'Unidad de prueba', repartidor_id: driverId })
    }, adminCookie);
    assert.equal(result.response.status, 201);
    vehicleId = Number(result.data.id);

    result = await request(`/api/logistica/vehiculos/${vehicleId}/movimientos`, {
      method: 'POST',
      body: JSON.stringify({ tipo: 'carga', producto_id: product.id, cantidad: 3 })
    }, adminCookie);
    assert.equal(result.response.status, 200);

    const secondary = await createCompany(secondarySlug, 'secundaria');
    result = await request(`/api/auth/repartidores/${driverId}/resend-verification`, {
      method: 'POST'
    }, secondary.cookie);
    assert.equal(result.response.status, 404);

    result = await request(`/api/productos/${product.id}`, {}, secondary.cookie);
    assert.equal(result.response.status, 404);

    imageResponse = await requestRaw('/api/branding/logo', {}, secondary.cookie);
    assert.equal(imageResponse.status, 404);
    imageResponse = await requestRaw(`/api/productos/${product.id}/imagen`, {}, secondary.cookie);
    assert.equal(imageResponse.status, 404);
    result = await request(`/api/productos/${product.id}/imagen`, {
      method: 'PUT',
      body: JSON.stringify({ image: testImage })
    }, secondary.cookie);
    assert.equal(result.response.status, 404);

    result = await request('/api/auth/client-portal', {}, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.enabled, true);
    const originalClientInvite = tokenFromUrl(result.data.client_portal_url, 'invite');
    assert.equal(
      new URL(result.data.client_portal_url).searchParams.get('cliente_empresa'),
      primarySlug
    );

    const clientRegistrationSocket = await connectSocket(adminCookie);
    const adminReceivedClientRegistration = waitForSocketEvent(
      clientRegistrationSocket,
      'operacion_actualizada',
      (data) => data.recurso === '/api/auth'
        && data.accion === 'POST'
        && data.actorRol === 'cliente'
    );
    const clientEmail = `cliente-${unique}@example.com`;
    result = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        nombre: 'Cliente Prueba',
        email: clientEmail,
        password,
        telefono: '0988888888',
        empresa_slug: primarySlug,
        invite_token: originalClientInvite
      })
    });
    assert.equal(result.response.status, 201);
    assert.equal(result.data.can_login, true);
    assert.equal(result.data.user.rol, 'cliente');
    assert.equal(result.data.user.acceso_cliente_autorizado, true);
    clientCookie = result.response.headers.get('set-cookie').split(';')[0];
    await adminReceivedClientRegistration;

    result = await request('/api/auth/me', {}, clientCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.user.rol, 'cliente');

    result = await request('/api/auth/clientes', {}, clientCookie);
    assert.equal(result.response.status, 403);

    result = await request('/api/auth/clientes', {}, adminCookie);
    assert.equal(result.response.status, 200);
    const managedClient = result.data.find((item) => item.email === clientEmail);
    assert.ok(managedClient);

    result = await request('/api/auth/clientes', {}, secondary.cookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.some((item) => item.id === managedClient.id), false);
    result = await request(`/api/auth/clientes/${managedClient.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ estado: 'inactivo' })
    }, secondary.cookie);
    assert.equal(result.response.status, 404);
    result = await request('/api/auth/repartidores', {}, secondary.cookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.some((item) => item.id === driverId), false);
    result = await request('/api/organizacion/equipo', {}, secondary.cookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.some((item) => item.id === driverId), false);

    imageResponse = await requestRaw('/api/branding/logo', {}, clientCookie);
    assert.equal(imageResponse.status, 200);
    imageResponse = await requestRaw(`/api/productos/${product.id}/imagen`, {}, clientCookie);
    assert.equal(imageResponse.status, 200);

    result = await request('/api/auth/client-portal/rotate', { method: 'POST' }, adminCookie);
    assert.equal(result.response.status, 200);
    assert.notEqual(tokenFromUrl(result.data.client_portal_url, 'invite'), originalClientInvite);

    result = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        nombre: 'Cliente con enlace anterior',
        email: `enlace-anterior-${unique}@example.com`,
        password,
        empresa_slug: primarySlug,
        invite_token: originalClientInvite
      })
    });
    assert.equal(result.response.status, 403);

    result = await request(`/api/auth/clientes/${managedClient.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ estado: 'inactivo' })
    }, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.estado, 'inactivo');

    result = await request('/api/auth/me', {}, clientCookie);
    assert.equal(result.response.status, 401);

    result = await request(`/api/auth/clientes/${managedClient.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ estado: 'activo' })
    }, adminCookie);
    assert.equal(result.response.status, 200);
    clientCookie = (await login(clientEmail, password)).cookie;

    result = await request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: clientEmail })
    });
    assert.equal(result.response.status, 200);
    const resetToken = tokenFromUrl(result.data.development_url, 'reset_token');
    result = await request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: resetToken, password: newPassword })
    });
    assert.equal(result.response.status, 200);

    result = await request('/api/auth/me', {}, clientCookie);
    assert.equal(result.response.status, 401);
    clientCookie = (await login(clientEmail, newPassword)).cookie;

    result = await request('/api/direcciones', {
      method: 'POST',
      body: JSON.stringify({
        etiqueta: 'Casa',
        direccion: 'Urbanización Agua Clara, casa 12',
        indicaciones: 'Portón azul, llamar al llegar',
        latitud: -0.180653,
        longitud: -78.467838,
        es_predeterminada: true
      })
    }, clientCookie);
    assert.equal(result.response.status, 201);
    assert.equal(result.data.es_predeterminada, true);
    savedAddressId = Number(result.data.id);

    result = await request('/api/direcciones', {}, clientCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.length, 1);
    assert.equal(Number(result.data[0].id), savedAddressId);

    result = await request(`/api/direcciones/${savedAddressId}`, {
      method: 'PUT',
      body: JSON.stringify({
        etiqueta: 'Casa principal',
        direccion: 'Urbanización Agua Clara, casa 12',
        indicaciones: 'Portón azul, llamar al llegar',
        latitud: -0.180653,
        longitud: -78.467838,
        es_predeterminada: true
      })
    }, clientCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.etiqueta, 'Casa principal');

    result = await request('/api/direcciones', {
      method: 'POST',
      body: JSON.stringify({
        etiqueta: 'Oficina',
        direccion: 'Avenida de prueba 456',
        indicaciones: '',
        latitud: null,
        longitud: null,
        es_predeterminada: false
      })
    }, clientCookie);
    assert.equal(result.response.status, 201);
    const alternateAddressId = Number(result.data.id);

    result = await request(`/api/direcciones/${alternateAddressId}`, {
      method: 'PUT',
      body: JSON.stringify({
        etiqueta: 'Oficina',
        direccion: 'Avenida de prueba 456',
        indicaciones: '',
        latitud: null,
        longitud: null,
        es_predeterminada: true
      })
    }, clientCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.es_predeterminada, true);

    result = await request(`/api/direcciones/${alternateAddressId}`, {
      method: 'DELETE'
    }, clientCookie);
    assert.equal(result.response.status, 200);

    result = await request('/api/direcciones', {}, clientCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.length, 1);
    assert.equal(Number(result.data[0].id), savedAddressId);
    assert.equal(result.data[0].es_predeterminada, true);

    result = await request('/api/direcciones', {}, adminCookie);
    assert.equal(result.response.status, 403);

    const todayEcuador = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    const tomorrow = new Date(`${todayEcuador}T12:00:00-05:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowEcuador = tomorrow.toISOString().slice(0, 10);

    const recurringKey = `recurring_${unique}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
    const recurringPayload = {
      frecuencia: 'semanal',
      proxima_entrega: todayEcuador,
      direccion_entrega: 'Dirección recurrente 789',
      metodo_pago: 'efectivo',
      productos: [{ producto_id: product.id, cantidad: 1 }],
      idempotency_key: recurringKey
    };
    result = await request('/api/recurrentes', {
      method: 'POST',
      body: JSON.stringify(recurringPayload)
    }, clientCookie);
    assert.equal(result.response.status, 201);
    recurringScheduleId = Number(result.data.id);
    recurringOrderId = Number(result.data.pedido_generado.id);

    result = await request('/api/recurrentes', {
      method: 'POST', body: JSON.stringify(recurringPayload)
    }, clientCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.duplicate, true);
    assert.equal(Number(result.data.id), recurringScheduleId);

    result = await request('/api/recurrentes/mis-programaciones', {}, clientCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.filter((item) => Number(item.id) === recurringScheduleId).length, 1);
    assert.equal(result.data.find((item) => Number(item.id) === recurringScheduleId).ejecuciones.length, 1);

    result = await request(`/api/pedidos/${recurringOrderId}/estado`, {
      method: 'PUT', body: JSON.stringify({ estado: 'cancelado' })
    }, clientCookie);
    assert.equal(result.response.status, 200);

    result = await request(`/api/recurrentes/${recurringScheduleId}/estado`, {
      method: 'PUT', body: JSON.stringify({ accion: 'pausar' })
    }, clientCookie);
    assert.equal(result.response.status, 200);
    result = await request(`/api/recurrentes/${recurringScheduleId}/estado`, {
      method: 'PUT', body: JSON.stringify({ accion: 'reanudar', proxima_entrega: tomorrowEcuador })
    }, clientCookie);
    assert.equal(result.response.status, 200);
    result = await request(`/api/recurrentes/${recurringScheduleId}/estado`, {
      method: 'PUT', body: JSON.stringify({ accion: 'omitir' })
    }, clientCookie);
    assert.equal(result.response.status, 200);

    result = await request('/api/recurrentes/admin/todas', {}, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.some((item) => Number(item.id) === recurringScheduleId), true);

    result = await request(`/api/recurrentes/${recurringScheduleId}/estado`, {
      method: 'PUT', body: JSON.stringify({ accion: 'cancelar' })
    }, adminCookie);
    assert.equal(result.response.status, 200);

    result = await request('/api/organizacion/config', {
      method: 'PUT',
      body: JSON.stringify({ planta: false })
    }, clientCookie);
    assert.equal(result.response.status, 403);

    result = await request('/api/pedidos/admin/todos', {}, clientCookie);
    assert.equal(result.response.status, 403);

    driverCookie = (await login(driverEmail, password)).cookie;
    const adminSocket = await connectSocket(adminCookie);
    const clientSocket = await connectSocket(clientCookie);
    const driverSocket = await connectSocket(driverCookie);
    const adminReceivedOrder = waitForSocketEvent(adminSocket, 'pedido_recibido');
    const adminSawTenantRefresh = waitForSocketEvent(
      adminSocket,
      'operacion_actualizada',
      (data) => data.recurso === '/api/pedidos' && data.accion === 'POST'
    );

    result = await request('/api/pedidos', {
      method: 'POST',
      body: JSON.stringify({
        productos: [{ producto_id: product.id, cantidad: 1 }],
        direccion_id: savedAddressId,
        direccion_entrega: 'Este texto no debe prevalecer',
        metodo_pago: 'efectivo',
        latitud_entrega: -0.181111,
        longitud_entrega: -78.468222
      })
    }, clientCookie);
    assert.equal(result.response.status, 201);
    assert.equal(Number(result.data.direccion_cliente_id), savedAddressId);
    assert.equal(result.data.direccion_entrega, 'Urbanización Agua Clara, casa 12');
    assert.equal(result.data.indicaciones_entrega, 'Portón azul, llamar al llegar');
    assert.equal(Number(result.data.latitud_entrega), -0.181111);
    assert.equal(Number(result.data.longitud_entrega), -78.468222);
    orderId = result.data.id;
    const receivedOrder = await adminReceivedOrder;
    assert.equal(Number(receivedOrder.pedido_id), orderId);
    await adminSawTenantRefresh;

    result = await request('/api/pedidos', {
      method: 'POST',
      body: JSON.stringify({
        productos: [{ producto_id: product.id, cantidad: 1 }],
        direccion_entrega: 'Segunda dirección de prueba 456',
        metodo_pago: 'efectivo',
        latitud_entrega: null,
        longitud_entrega: null
      })
    }, clientCookie);
    assert.equal(result.response.status, 201);
    additionalOrderId = result.data.id;
    assert.equal(result.data.direccion_entrega, 'Segunda dirección de prueba 456');

    result = await request(`/api/pedidos/${additionalOrderId}/estado`, {
      method: 'PUT', body: JSON.stringify({ estado: 'cancelado' })
    }, clientCookie);
    assert.equal(result.response.status, 200);
    additionalOrderCancelled = true;

    result = await request(`/api/pedidos/${orderId}/asignar`, {
      method: 'PUT',
      body: JSON.stringify({ repartidor_id: driverId })
    }, clientCookie);
    assert.equal(result.response.status, 403);

    const driverAssignedOrder = waitForSocketEvent(
      driverSocket,
      'nuevo_pedido_asignado',
      (data) => Number(data.pedidoId) === orderId
    );
    const clientSawAssignment = waitForSocketEvent(
      clientSocket,
      'pedido_actualizado',
      (data) => Number(data.pedidoId) === orderId && data.estado === 'asignado'
    );
    result = await request(`/api/pedidos/${orderId}/asignar`, {
      method: 'PUT',
      body: JSON.stringify({ repartidor_id: driverId })
    }, adminCookie);
    assert.equal(result.response.status, 200);
    await Promise.all([driverAssignedOrder, clientSawAssignment]);

    result = await request('/api/logistica/mi-vehiculo', {}, driverCookie);
    assert.equal(result.response.status, 200);
    assert.equal(Number(result.data.inventario.find((item) => item.producto_id === product.id).cantidad), 3);

    const routeSaleKey = `route_${unique}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
    result = await request('/api/ventas/ruta', {
      method: 'POST',
      body: JSON.stringify({
        cliente_nombre: 'Cliente durante ruta',
        cliente_telefono: '0966666666',
        direccion: 'Parada adicional 45',
        metodo_pago: 'efectivo',
        observaciones: 'Venta registrada desde el vehiculo',
        productos: [{ producto_id: product.id, cantidad: 2, envases_devueltos: 1 }],
        idempotency_key: routeSaleKey,
        vendido_en: new Date().toISOString()
      })
    }, driverCookie);
    assert.equal(result.response.status, 201);
    routeSaleId = Number(result.data.id);
    const routeSaleTotal = Number(result.data.total);

    result = await request('/api/ventas/ruta', {
      method: 'POST',
      body: JSON.stringify({
        cliente_nombre: 'Cliente durante ruta',
        metodo_pago: 'efectivo',
        productos: [{ producto_id: product.id, cantidad: 2 }],
        idempotency_key: routeSaleKey,
        vendido_en: new Date().toISOString()
      })
    }, driverCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.duplicate, true);

    result = await request('/api/ventas/mis-ventas', {}, driverCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.some((sale) => Number(sale.id) === routeSaleId), true);

    result = await request('/api/logistica/cierres', {
      method: 'POST',
      body: JSON.stringify({ efectivo_declarado: routeSaleTotal, gastos: 0, observaciones: 'Cierre prematuro' })
    }, driverCookie);
    assert.equal(result.response.status, 409);

    result = await request(`/api/ventas/ruta/${routeSaleId}/revision`, {
      method: 'PUT',
      body: JSON.stringify({ decision: 'aprobar', nota: '' })
    }, driverCookie);
    assert.equal(result.response.status, 403);

    result = await request(`/api/ventas/ruta/${routeSaleId}/revision`, {
      method: 'PUT',
      body: JSON.stringify({ decision: 'aprobar', nota: '' })
    }, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.estado_revision, 'aprobada');

    result = await request(`/api/logistica/vehiculos/${vehicleId}/movimientos`, {
      method: 'POST',
      body: JSON.stringify({ tipo: 'descarga', producto_id: product.id, cantidad: 1 })
    }, adminCookie);
    assert.equal(result.response.status, 200);

    const hrEmail = `rh-${unique}@example.com`;
    result = await request('/api/organizacion/equipo', {
      method: 'POST',
      body: JSON.stringify({
        nombre: 'Responsable Recursos Humanos',
        email: hrEmail,
        password,
        telefono: '0955555555',
        rol: 'rh',
        cargo: 'Coordinador de talento',
        area: 'Recursos Humanos',
        fecha_ingreso: new Date().toISOString().slice(0, 10),
        tipo_contrato: 'indefinido'
      })
    }, adminCookie);
    assert.equal(result.response.status, 201);
    await verifyEmail(result.data.development_url);
    const hrCookie = (await login(hrEmail, password)).cookie;
    result = await request('/api/organizacion/equipo', {}, hrCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.some((employee) => employee.email === hrEmail), true);
    const hrSocket = await connectSocket(hrCookie);

    const plantEmail = `planta-${unique}@example.com`;
    const hrSawPlantMember = waitForSocketEvent(
      hrSocket,
      'operacion_actualizada',
      (data) => data.recurso === '/api/organizacion' && data.accion === 'POST'
    );
    result = await request('/api/organizacion/equipo', {
      method: 'POST',
      body: JSON.stringify({
        nombre: 'Responsable Planta',
        email: plantEmail,
        password,
        telefono: '0944444444',
        rol: 'jefe_planta',
        cargo: 'Jefe de planta',
        area: 'Planta',
        fecha_ingreso: new Date().toISOString().slice(0, 10),
        tipo_contrato: 'indefinido'
      })
    }, adminCookie);
    assert.equal(result.response.status, 201);
    await hrSawPlantMember;
    await verifyEmail(result.data.development_url);
    const plantSession = await login(plantEmail, password);
    assert.equal(plantSession.user.rol, 'jefe_planta');
    assert.equal(plantSession.user.empresa.modulos.planta, true);
    const plantSocket = await connectSocket(plantSession.cookie);
    const plantSawBatch = waitForSocketEvent(
      plantSocket,
      'operacion_actualizada',
      (data) => data.recurso === '/api/organizacion' && data.accion === 'POST'
    );

    result = await request('/api/organizacion/lotes', {
      method: 'POST',
      body: JSON.stringify({
        codigo: `LOTE-${Date.now()}`,
        producto_id: product.id,
        cantidad: 2,
        fecha_produccion: new Date().toISOString().slice(0, 10),
        observaciones: 'Lote de integracion'
      })
    }, plantSession.cookie);
    assert.equal(result.response.status, 201);
    await plantSawBatch;
    batchId = Number(result.data.id);

    result = await request(`/api/organizacion/lotes/${batchId}`, {
      method: 'PUT', body: JSON.stringify({ estado: 'en_proceso' })
    }, plantSession.cookie);
    assert.equal(result.response.status, 200);
    result = await request(`/api/organizacion/lotes/${batchId}`, {
      method: 'PUT', body: JSON.stringify({ resultado_calidad: 'aprobado' })
    }, plantSession.cookie);
    assert.equal(result.response.status, 200);
    result = await request(`/api/organizacion/lotes/${batchId}`, {
      method: 'PUT', body: JSON.stringify({ estado: 'completado' })
    }, plantSession.cookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.stock_aplicado, true);

    result = await request('/api/auth/ubicacion/consentimiento', {
      method: 'POST',
      body: JSON.stringify({ aceptado: true })
    }, driverCookie);
    assert.equal(result.response.status, 200);

    const clientSawLocation = waitForSocketEvent(
      clientSocket,
      'ubicacion_repartidor',
      (data) => Number(data.pedidoId) === orderId
    );
    const adminSawLocation = waitForSocketEvent(
      adminSocket,
      'ubicacion_repartidor',
      (data) => Number(data.pedidoId) === orderId
    );
    const locationAck = await driverSocket.timeout(5000).emitWithAck('enviar_ubicacion', {
      pedidoId: orderId,
      latitud: -0.180653,
      longitud: -78.467838,
      precision: 8
    });
    assert.equal(locationAck.ok, true);
    await Promise.all([clientSawLocation, adminSawLocation]);

    result = await request(`/api/pedidos/${orderId}/ubicacion`, {}, clientCookie);
    assert.equal(result.response.status, 200);
    assert.equal(Number(result.data.latitud), -0.180653);

    result = await request('/api/pedidos/ubicaciones/activas', {}, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.some((location) => location.pedido_id === orderId), true);

    result = await request(`/api/pedidos/${orderId}/estado`, {
      method: 'PUT',
      body: JSON.stringify({ estado: 'cancelado' })
    }, adminCookie);
    assert.equal(result.response.status, 200);
    cancelled = true;

    result = await request('/api/productos', {}, clientCookie);
    const restoredProduct = result.data.find((item) => item.id === product.id);
    assert.equal(Number(restoredProduct.stock), stockBefore);

    result = await request('/api/pedidos', {
      method: 'POST',
      body: JSON.stringify({
        productos: [{ producto_id: product.id, cantidad: 1 }],
        direccion_entrega: 'Entrega con comprobante 456',
        metodo_pago: 'efectivo'
      })
    }, clientCookie);
    assert.equal(result.response.status, 201);
    deliveryOrderId = Number(result.data.id);

    result = await request('/api/pedidos', {
      method: 'POST',
      body: JSON.stringify({
        productos: [{ producto_id: product.id, cantidad: 1 }],
        direccion_entrega: 'Entrega con incidencia 789',
        metodo_pago: 'efectivo'
      })
    }, clientCookie);
    assert.equal(result.response.status, 201);
    incidentOrderId = Number(result.data.id);

    result = await request('/api/rutas', {}, clientCookie);
    assert.equal(result.response.status, 403);

    result = await request(`/api/rutas/disponibles?fecha=${todayEcuador}`, {}, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.some((item) => Number(item.id) === deliveryOrderId), true);
    assert.equal(result.data.some((item) => Number(item.id) === incidentOrderId), true);

    result = await request('/api/rutas', {
      method: 'POST',
      body: JSON.stringify({
        nombre: 'Ruta de integración',
        fecha: todayEcuador,
        repartidor_id: driverId,
        pedido_ids: [deliveryOrderId, incidentOrderId]
      })
    }, adminCookie);
    assert.equal(result.response.status, 201, JSON.stringify(result.data));
    deliveryRouteId = Number(result.data.id);
    assert.equal(result.data.paradas.length, 2);
    const deliveryStopId = Number(result.data.paradas.find((item) => Number(item.pedido_id) === deliveryOrderId).id);
    const incidentStopId = Number(result.data.paradas.find((item) => Number(item.pedido_id) === incidentOrderId).id);

    result = await request(`/api/rutas?fecha=${todayEcuador}`, {}, secondary.cookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.some((item) => Number(item.id) === deliveryRouteId), false);

    result = await request(`/api/rutas/${deliveryRouteId}/orden`, {
      method: 'PUT',
      body: JSON.stringify({ parada_ids: [incidentStopId, deliveryStopId] })
    }, adminCookie);
    assert.equal(result.response.status, 200);

    result = await request('/api/rutas/mi-ruta', {}, driverCookie);
    assert.equal(result.response.status, 200);
    assert.equal(Number(result.data.ruta.id), deliveryRouteId);
    assert.equal(Number(result.data.ruta.paradas[0].pedido_id), incidentOrderId);

    result = await request(`/api/rutas/${deliveryRouteId}/iniciar`, { method: 'POST' }, adminCookie);
    assert.equal(result.response.status, 403);

    result = await request(`/api/rutas/${deliveryRouteId}/iniciar`, { method: 'POST' }, driverCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.estado, 'en_curso');

    result = await request(`/api/rutas/paradas/${incidentStopId}/en-camino`, {
      method: 'POST'
    }, driverCookie);
    assert.equal(result.response.status, 200);

    result = await request(`/api/rutas/paradas/${incidentStopId}/incidencia`, {
      method: 'POST',
      body: JSON.stringify({
        codigo: 'cliente_ausente',
        detalle: 'No respondió al llamado',
        reprogramar_para: tomorrowEcuador
      })
    }, driverCookie);
    assert.equal(result.response.status, 200);

    result = await request(`/api/rutas/disponibles?fecha=${tomorrowEcuador}`, {}, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.some((item) => Number(item.id) === incidentOrderId), true);

    result = await request(`/api/rutas/paradas/${deliveryStopId}/en-camino`, {
      method: 'POST'
    }, driverCookie);
    assert.equal(result.response.status, 200);
    assert.equal(Number(result.data.pedido_id), deliveryOrderId);

    result = await request('/api/notificaciones', {}, clientCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.notificaciones.some((item) => item.tipo === 'entrega_programada'), true);
    assert.equal(result.data.notificaciones.some((item) => item.tipo === 'ruta_iniciada'), true);
    assert.equal(result.data.notificaciones.some((item) => item.tipo === 'incidencia_entrega'), true);
    assert.equal(result.data.notificaciones.some((item) => item.tipo === 'repartidor_en_camino'), true);

    result = await request(`/api/pedidos/${deliveryOrderId}/estado`, {
      method: 'PUT', body: JSON.stringify({ estado: 'entregado' })
    }, driverCookie);
    assert.equal(result.response.status, 409);

    result = await request(`/api/logistica/comprobantes/${deliveryOrderId}`, {
      method: 'POST',
      body: JSON.stringify({
        receptor_nombre: 'Cliente Prueba',
        firma_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3WQAAAABJRU5ErkJggg==',
        observaciones: 'Entrega validada',
        latitud: -0.180653,
        longitud: -78.467838,
        envases: [{ producto_id: product.id, devueltos: 0 }]
      })
    }, driverCookie);
    assert.equal(result.response.status, 201);
    const deliveryTotal = Number(result.data.total);
    assert.equal(Number(result.data.deposito_envases), 1.5);
    assert.equal(deliveryTotal, Number(product.precio) + 1.5);

    result = await request(`/api/rutas?fecha=${todayEcuador}`, {}, adminCookie);
    assert.equal(result.response.status, 200);
    const completedRoute = result.data.find((item) => Number(item.id) === deliveryRouteId);
    assert.equal(completedRoute.estado, 'completada');
    assert.equal(completedRoute.paradas.find((item) => Number(item.id) === deliveryStopId).estado, 'entregada');
    assert.equal(completedRoute.paradas.find((item) => Number(item.id) === incidentStopId).estado, 'incidencia');

    result = await request('/api/notificaciones', {}, clientCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.notificaciones.some((item) => item.tipo === 'pedido_entregado'), true);
    const unreadNotification = result.data.notificaciones.find((item) => !item.leida);
    assert.ok(unreadNotification);
    result = await request(`/api/notificaciones/${unreadNotification.id}/leida`, {
      method: 'PATCH'
    }, clientCookie);
    assert.equal(result.response.status, 200);
    result = await request('/api/notificaciones/leer-todas', { method: 'POST' }, clientCookie);
    assert.equal(result.response.status, 200);
    result = await request('/api/notificaciones', {}, clientCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.no_leidas, 0);

    result = await request(`/api/logistica/comprobantes/${deliveryOrderId}`, {}, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.receptor_nombre, 'Cliente Prueba');

    result = await request('/api/logistica/envases', {}, adminCookie);
    assert.equal(result.response.status, 200);
    const containerBalance = result.data.find((item) => item.producto_id === product.id);
    assert.equal(containerBalance.entregados, 3);
    assert.equal(containerBalance.devueltos, 1);
    assert.equal(containerBalance.pendientes, 2);

    const closingCash = Number((routeSaleTotal + deliveryTotal).toFixed(2));
    result = await request('/api/logistica/cierres', {
      method: 'POST',
      body: JSON.stringify({ efectivo_declarado: closingCash, gastos: 0, observaciones: 'Cierre de integración' })
    }, driverCookie);
    assert.equal(result.response.status, 201, JSON.stringify(result.data));
    assert.equal(Number(result.data.efectivo_ventas), closingCash);
    assert.equal(Number(result.data.diferencia), 0);
    closingId = Number(result.data.id);

    result = await request(`/api/logistica/cierres/${closingId}/revision`, {
      method: 'PUT', body: JSON.stringify({ decision: 'observar', nota: 'Recontar efectivo' })
    }, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.estado_revision, 'observado');

    result = await request('/api/logistica/cierres', {
      method: 'POST',
      body: JSON.stringify({ efectivo_declarado: closingCash, gastos: 0, observaciones: 'Cierre corregido' })
    }, driverCookie);
    assert.equal(result.response.status, 201);
    assert.equal(result.data.estado_revision, 'pendiente');

    result = await request(`/api/logistica/cierres/${closingId}/revision`, {
      method: 'PUT', body: JSON.stringify({ decision: 'aprobar', nota: '' })
    }, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.estado_revision, 'aprobado');

    result = await request('/api/ventas/ruta', {
      method: 'POST',
      body: JSON.stringify({
        cliente_nombre: 'Venta posterior al cierre',
        metodo_pago: 'efectivo',
        productos: [{ producto_id: product.id, cantidad: 1 }],
        idempotency_key: `late_${unique}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80),
        vendido_en: new Date().toISOString()
      })
    }, driverCookie);
    assert.equal(result.response.status, 409);

    result = await request('/api/ventas/resumen', {}, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.aprobadas, 1);

    result = await request('/api/pedidos/reporte/ventas-por-dia-semana', {}, adminCookie);
    assert.equal(result.response.status, 200);
    assert.equal(Array.isArray(result.data), true);
    assert.equal(result.data.every((item) => Number.isInteger(Number(item.dia_semana))), true);

    result = await request('/api/auth/auditoria?limit=100', {}, adminCookie);
    assert.equal(result.response.status, 200);
    assert.ok(result.data.some((entry) => entry.accion === 'usuario.login'));

    console.log('Integración verificada: aislamiento de clientes y roles, identidad visual, imágenes privadas, portal, direcciones, rutas, incidencias, notificaciones, recurrencias, planta, flota, ventas, GPS, comprobantes, cierres y stock');
  } finally {
    for (const socket of liveSockets) socket.disconnect();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const discoveredCompanies = await client.query(
        `SELECT id
         FROM empresas
         WHERE slug = ANY($1::text[])`,
        [[primarySlug, secondarySlug]]
      );
      for (const company of discoveredCompanies.rows) {
        if (!companyIds.includes(company.id)) companyIds.push(company.id);
      }
      if (orderId) {
        if (!cancelled) {
          await client.query(
            `UPDATE productos pr
             SET stock = pr.stock + dp.cantidad
             FROM detalle_pedidos dp
             WHERE dp.pedido_id = $1 AND dp.producto_id = pr.id`,
            [orderId]
          );
        }
        await client.query('DELETE FROM ubicaciones_repartidores WHERE pedido_id = $1', [orderId]);
        await client.query('DELETE FROM detalle_pedidos WHERE pedido_id = $1', [orderId]);
        await client.query('DELETE FROM pedidos WHERE id = $1', [orderId]);
      }
      if (additionalOrderId) {
        if (!additionalOrderCancelled) {
          await client.query(
            `UPDATE productos pr
             SET stock = pr.stock + dp.cantidad
             FROM detalle_pedidos dp
             WHERE dp.pedido_id = $1 AND dp.producto_id = pr.id`,
            [additionalOrderId]
          );
        }
        await client.query('DELETE FROM ubicaciones_repartidores WHERE pedido_id = $1', [additionalOrderId]);
        await client.query('DELETE FROM detalle_pedidos WHERE pedido_id = $1', [additionalOrderId]);
        await client.query('DELETE FROM pedidos WHERE id = $1', [additionalOrderId]);
      }
      if (deliveryOrderId) {
        await client.query('DELETE FROM comprobantes_entrega WHERE pedido_id = $1', [deliveryOrderId]);
        await client.query('DELETE FROM detalle_pedidos WHERE pedido_id = $1', [deliveryOrderId]);
        await client.query('DELETE FROM pedidos WHERE id = $1', [deliveryOrderId]);
      }
      if (incidentOrderId) {
        await client.query('DELETE FROM detalle_pedidos WHERE pedido_id = $1', [incidentOrderId]);
        await client.query('DELETE FROM pedidos WHERE id = $1', [incidentOrderId]);
      }
      if (recurringOrderId) {
        await client.query('DELETE FROM detalle_pedidos WHERE pedido_id = $1', [recurringOrderId]);
        await client.query('DELETE FROM pedidos WHERE id = $1', [recurringOrderId]);
      }
      if (recurringScheduleId) {
        await client.query('DELETE FROM ejecuciones_pedidos_recurrentes WHERE pedido_recurrente_id = $1', [recurringScheduleId]);
        await client.query('DELETE FROM detalle_pedidos_recurrentes WHERE pedido_recurrente_id = $1', [recurringScheduleId]);
        await client.query('DELETE FROM pedidos_recurrentes WHERE id = $1', [recurringScheduleId]);
      }
      if (companyIds.length > 0) {
        await client.query('DELETE FROM notificaciones WHERE empresa_id = ANY($1::int[])', [companyIds]);
        await client.query('DELETE FROM paradas_ruta WHERE empresa_id = ANY($1::int[])', [companyIds]);
        await client.query('DELETE FROM rutas_entrega WHERE empresa_id = ANY($1::int[])', [companyIds]);
        await client.query('DELETE FROM ejecuciones_pedidos_recurrentes WHERE pedido_recurrente_id IN (SELECT id FROM pedidos_recurrentes WHERE empresa_id = ANY($1::int[]))', [companyIds]);
        await client.query('DELETE FROM detalle_pedidos_recurrentes WHERE pedido_recurrente_id IN (SELECT id FROM pedidos_recurrentes WHERE empresa_id = ANY($1::int[]))', [companyIds]);
        await client.query('DELETE FROM pedidos_recurrentes WHERE empresa_id = ANY($1::int[])', [companyIds]);
        await client.query('DELETE FROM movimientos_envases WHERE empresa_id = ANY($1::int[])', [companyIds]);
        await client.query('DELETE FROM cierres_ruta WHERE empresa_id = ANY($1::int[])', [companyIds]);
        await client.query('DELETE FROM detalle_ventas_ruta WHERE venta_id IN (SELECT id FROM ventas_ruta WHERE empresa_id = ANY($1::int[]))', [companyIds]);
        await client.query('DELETE FROM ventas_ruta WHERE empresa_id = ANY($1::int[])', [companyIds]);
        await client.query('DELETE FROM movimientos_inventario_vehiculos WHERE empresa_id = ANY($1::int[])', [companyIds]);
        await client.query('DELETE FROM inventario_vehiculos WHERE vehiculo_id IN (SELECT id FROM vehiculos WHERE empresa_id = ANY($1::int[]))', [companyIds]);
        await client.query('DELETE FROM vehiculos WHERE empresa_id = ANY($1::int[])', [companyIds]);
        await client.query('DELETE FROM lotes_produccion WHERE empresa_id = ANY($1::int[])', [companyIds]);
        await client.query('DELETE FROM eventos_suscripcion WHERE empresa_id = ANY($1::int[])', [companyIds]);
        await client.query('DELETE FROM auditoria WHERE empresa_id = ANY($1::int[])', [companyIds]);
        await client.query('DELETE FROM perfiles_empleados WHERE empresa_id = ANY($1::int[])', [companyIds]);
        await client.query('DELETE FROM productos WHERE empresa_id = ANY($1::int[])', [companyIds]);
        await client.query('DELETE FROM usuarios WHERE empresa_id = ANY($1::int[])', [companyIds]);
        await client.query('DELETE FROM empresas WHERE id = ANY($1::int[])', [companyIds]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
