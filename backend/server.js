const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const env = require('./config/env');
const db = require('./config/database');
const { parseCookies, getActiveUser } = require('./middleware/auth');
const { auditSuccessfulMutations } = require('./utils/audit');
const { hasTenantAccess } = require('./utils/plans');
const { scheduleMaintenance } = require('./utils/maintenance');
const logger = require('./utils/logger');
const { createNotification, emitNotifications } = require('./utils/notifications');

const authRoutes = require('./routes/auth.routes');
const pedidosRoutes = require('./routes/pedidos.routes');
const productosRoutes = require('./routes/productos.routes');
const inventarioRoutes = require('./routes/inventario.routes');
const repartidorRoutes = require('./routes/repartidor.routes');
const billingRoutes = require('./routes/billing.routes');
const ventasRoutes = require('./routes/ventas.routes');
const organizacionRoutes = require('./routes/organizacion.routes');
const logisticaRoutes = require('./routes/logistica.routes');
const recurrentesRoutes = require('./routes/recurrentes.routes');
const platformRoutes = require('./routes/platform.routes');
const direccionesRoutes = require('./routes/direcciones.routes');
const rutasRoutes = require('./routes/rutas.routes');
const notificacionesRoutes = require('./routes/notificaciones.routes');

const app = express();
const server = http.createServer(app);

const isAllowedOrigin = (origin, host) => {
  // Native clients do not always send Origin. Cookie mutations still pass the CSRF guard below.
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    if (env.nodeEnv === 'production') {
      return parsed.origin === env.appUrl || env.allowedOrigins.includes(parsed.origin);
    }
    return parsed.host === host || env.allowedOrigins.includes(parsed.origin);
  } catch (error) {
    return false;
  }
};

const io = socketIO(server, {
  allowRequest: (request, callback) => {
    callback(null, isAllowedOrigin(request.headers.origin, request.headers.host));
  }
});

app.disable('x-powered-by');
app.set('trust proxy', env.trustProxy);
app.set('io', io);

app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

// Build dynamic CSP connect sources including configured app URL and allowed origins
const cspConnectSrc = [
  "'self'",
  'ws:',
  'wss:',
  'https://api-uat.kushkipagos.com',
  'https://api.kushkipagos.com',
  'https://*.kushkipagos.com'
];
if (env.appUrl) cspConnectSrc.push(env.appUrl);
for (const o of env.allowedOrigins) {
  if (o && !cspConnectSrc.includes(o)) cspConnectSrc.push(o);
}

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  strictTransportSecurity: env.nodeEnv === 'production'
    ? { maxAge: 31536000, includeSubDomains: false, preload: false }
    : false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.cspNonce}'`,
        'https://cdn.kushkipagos.com'
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'"
      ],
      fontSrc: [
        "'self'",
        'data:'
      ],
      imgSrc: [
        "'self'",
        'data:',
        'https://tile.openstreetmap.org',
        'https://*.kushkipagos.com'
      ],
      connectSrc: cspConnectSrc,
      objectSrc: ["'none'"],
      frameSrc: ["'self'", 'https://*.kushkipagos.com'],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: env.nodeEnv === 'production' ? [] : null
    }
  }
}));

app.use((req, res, next) => {
  res.set('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  next();
});

app.use((req, res, next) => cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin, req.get('host'))) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
})(req, res, next));

// Global rate limiter (keeps default generous but safer than unlimited)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

app.use((req, res, next) => {
  const requestId = req.get('x-request-id')?.slice(0, 100) || crypto.randomUUID();
  req.requestId = requestId;
  res.set('x-request-id', requestId);
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info('http_request', {
      requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      userId: req.user?.id,
      companyId: req.user?.empresa_id
    });
  });
  next();
});

app.use(auditSuccessfulMutations);

app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }
  const source = req.get('origin') || req.get('referer');
  const cookies = parseCookies(req.get('cookie'));
  const hasCookieSession = Boolean(cookies[env.sessionCookie] || cookies[env.platformSessionCookie]);
  const usesBearerToken = /^Bearer\s+\S+/i.test(req.get('authorization') || '');
  if ((source && !isAllowedOrigin(source, req.get('host'))) || (!source && hasCookieSession && !usesBearerToken)) {
    return res.status(403).json({ error: 'Origen de solicitud no permitido' });
  }
  return next();
});

app.use('/api/auth', authRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/repartidor', repartidorRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/organizacion', organizacionRoutes);
app.use('/api/logistica', logisticaRoutes);
app.use('/api/recurrentes', recurrentesRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/direcciones', direccionesRoutes);
app.use('/api/rutas', rutasRoutes);
app.use('/api/notificaciones', notificacionesRoutes);

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    return res.json({
      message: 'AquaControl API funcionando',
      status: 'ok',
      database_security: 'rls_enforced'
    });
  } catch (error) {
    return res.status(503).json({ message: 'Servicio temporalmente no disponible', status: 'error' });
  }
});

app.get('/api/metrics', async (req, res) => {
  if (!env.monitoringToken) {
    return res.status(404).json({ error: 'Recurso no encontrado' });
  }
  if (req.get('authorization') !== `Bearer ${env.monitoringToken}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    const database = await db.query(
      `SELECT
         (SELECT COUNT(*)::INT FROM empresas WHERE estado = 'activa') AS empresas_activas,
         (SELECT COUNT(*)::INT FROM pedidos WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') AS pedidos_24h`
    );
    return res.json({
      status: 'ok',
      uptime_seconds: Math.floor(process.uptime()),
      memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      ...database.rows[0]
    });
  } catch (error) {
    return res.status(503).json({ status: 'error' });
  }
});

app.use('/vendor/leaflet', express.static(path.join(__dirname, 'node_modules/leaflet/dist'), {
  etag: true,
  maxAge: env.nodeEnv === 'production' ? '7d' : 0
}));

app.use('/vendor/chartjs', express.static(path.join(__dirname, 'node_modules/chart.js/dist'), {
  etag: true,
  maxAge: env.nodeEnv === 'production' ? '7d' : 0
}));

app.use('/vendor/fontawesome', express.static(path.join(__dirname, 'node_modules/@fortawesome/fontawesome-free'), {
  etag: true,
  maxAge: env.nodeEnv === 'production' ? '7d' : 0
}));

app.use('/vendor/inter', express.static(path.join(__dirname, 'node_modules/@fontsource/inter'), {
  etag: true,
  maxAge: env.nodeEnv === 'production' ? '7d' : 0
}));

const frontendRoot = path.join(__dirname, '../frontend');
const htmlTemplates = new Map([
  ['inicio', fs.readFileSync(path.join(frontendRoot, 'index.html'), 'utf8')],
  ['admin', fs.readFileSync(path.join(frontendRoot, 'admin/index.html'), 'utf8')],
  ['cliente', fs.readFileSync(path.join(frontendRoot, 'cliente/app.html'), 'utf8')],
  ['repartidor', fs.readFileSync(path.join(frontendRoot, 'repartidor/index.html'), 'utf8')],
  ['equipo', fs.readFileSync(path.join(frontendRoot, 'equipo/index.html'), 'utf8')],
  ['plataforma', fs.readFileSync(path.join(frontendRoot, 'plataforma/index.html'), 'utf8')]
]);

const sendHtml = (templateName) => (req, res) => {
  const html = htmlTemplates.get(templateName).replaceAll('{{CSP_NONCE}}', res.locals.cspNonce);
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(html);
};

app.get(['/', '/index.html'], sendHtml('inicio'));
app.get(['/admin', '/admin/', '/admin/index.html'], sendHtml('admin'));
app.get(['/cliente/app.html'], sendHtml('cliente'));
app.get(['/repartidor', '/repartidor/', '/repartidor/index.html'], sendHtml('repartidor'));
app.get(['/equipo', '/equipo/', '/equipo/index.html'], sendHtml('equipo'));
app.get(['/plataforma', '/plataforma/', '/plataforma/index.html'], sendHtml('plataforma'));

app.use(express.static(frontendRoot, {
  etag: true,
  maxAge: env.nodeEnv === 'production' ? '1h' : 0
}));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado' });
});

app.use((error, req, res, next) => {
  logger.error('unhandled_http_error', {
    error,
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl
  });
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'Ocurrió un error inesperado' });
});

io.use(async (socket, next) => {
  try {
    const cookieToken = parseCookies(socket.handshake.headers.cookie)[env.sessionCookie];
    const authToken = socket.handshake.auth?.token;
    const token = cookieToken || authToken;
    if (!token) return next(new Error('No autenticado'));

    const payload = jwt.verify(token, env.jwtSecret, {
      issuer: 'aquacontrol',
      audience: 'aquacontrol-web'
    });
    const user = await getActiveUser(payload.id, payload.sv);
    if (!user) return next(new Error('No autenticado'));
    if (!hasTenantAccess(user)) return next(new Error('Suscripción requerida'));

    socket.data.user = user;
    return next();
  } catch (error) {
    return next(new Error('No autenticado'));
  }
});

io.on('connection', (socket) => {
  const user = socket.data.user;
  socket.join(`user:${user.id}`);
  socket.join(`empresa:${user.empresa_id}`);
  if (user.rol === 'admin') {
    socket.join(`empresa:${user.empresa_id}:admins`);
  }

  socket.on('enviar_ubicacion', async (data = {}, acknowledge = () => {}) => {
    if (user.rol !== 'repartidor') {
      return acknowledge({ ok: false, error: 'No autorizado' });
    }

    const orderId = Number(data.pedidoId);
    const latitude = Number(data.latitud);
    const longitude = Number(data.longitud);
    const accuracy = data.precision === undefined || data.precision === null
      ? null
      : Number(data.precision);
    if (!Number.isInteger(orderId) || orderId <= 0
        || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
        || (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000))) {
      return acknowledge({ ok: false, error: 'Ubicación inválida' });
    }

    try {
      const consent = await db.query(
        `SELECT 1
         FROM usuarios
         WHERE id = $1
           AND empresa_id = $2
           AND ubicacion_consentida_en IS NOT NULL`,
        [user.id, user.empresa_id]
      );
      if (consent.rowCount === 0) {
        return acknowledge({ ok: false, error: 'Debes autorizar el uso de ubicación' });
      }

      const plannedStop = await db.query(
        `SELECT pr.id, pr.ruta_id, pr.estado, r.estado AS ruta_estado,
                EXISTS (
                  SELECT 1 FROM paradas_ruta other
                  WHERE other.ruta_id = pr.ruta_id
                    AND other.estado = 'en_camino'
                    AND other.id <> pr.id
                ) AS otra_parada_activa
         FROM paradas_ruta pr
         JOIN rutas_entrega r ON r.id = pr.ruta_id AND r.empresa_id = pr.empresa_id
         WHERE pr.pedido_id = $1 AND pr.empresa_id = $2
           AND r.repartidor_id = $3
           AND pr.estado IN ('pendiente', 'en_camino')
           AND r.estado IN ('planificada', 'en_curso')
         LIMIT 1`,
        [orderId, user.empresa_id, user.id]
      );
      const stop = plannedStop.rows[0];
      if (stop?.ruta_estado === 'planificada') {
        return acknowledge({ ok: false, error: 'Inicia la ruta antes de compartir ubicación' });
      }
      if (stop?.otra_parada_activa) {
        return acknowledge({ ok: false, error: 'Este pedido no es la parada activa de la ruta' });
      }

      const result = await db.query(
        `WITH target AS (
           SELECT id, estado FROM pedidos
           WHERE id = $1 AND empresa_id = $2 AND repartidor_id = $3
             AND estado IN ('asignado', 'en_camino')
           FOR UPDATE
         )
         UPDATE pedidos p
         SET estado = CASE WHEN p.estado = 'asignado' THEN 'en_camino' ELSE p.estado END,
             actualizado_en = CURRENT_TIMESTAMP
         FROM target
         WHERE p.id = target.id
         RETURNING p.cliente_id, p.estado, target.estado AS estado_anterior`,
        [orderId, user.empresa_id, user.id]
      );
      if (result.rowCount === 0) {
        return acknowledge({ ok: false, error: 'Pedido no autorizado' });
      }

      if (stop?.estado === 'pendiente') {
        await db.query(
          `UPDATE paradas_ruta
           SET estado = 'en_camino', iniciada_en = COALESCE(iniciada_en, CURRENT_TIMESTAMP),
               actualizada_en = CURRENT_TIMESTAMP
           WHERE id = $1 AND empresa_id = $2 AND estado = 'pendiente'`,
          [stop.id, user.empresa_id]
        );
      }

      await db.query(
        `INSERT INTO ubicaciones_repartidores
          (pedido_id, empresa_id, repartidor_id, latitud, longitud, precision_metros)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (pedido_id) DO UPDATE
         SET latitud = EXCLUDED.latitud,
             longitud = EXCLUDED.longitud,
             precision_metros = EXCLUDED.precision_metros,
             actualizado_en = CURRENT_TIMESTAMP`,
        [orderId, user.empresa_id, user.id, latitude, longitude, accuracy]
      );

      const order = result.rows[0];
      if (order.estado_anterior === 'asignado') {
        try {
          const notification = await createNotification({
            empresaId: user.empresa_id,
            userId: order.cliente_id,
            type: 'repartidor_en_camino',
            title: 'Tu repartidor va en camino',
            message: `El pedido #${orderId} salió para entrega.`,
            orderId,
            routeId: stop?.ruta_id || null,
            eventKey: `order-on-way-${orderId}`
          });
          emitNotifications(io, [notification]);
        } catch (notificationError) {
          logger.error('location_notification_failed', { error: notificationError, orderId });
        }
      }
      const locationPayload = {
        repartidorId: user.id,
        latitud: latitude,
        longitud: longitude,
        precision: accuracy,
        pedidoId: orderId,
        actualizadoEn: new Date().toISOString()
      };
      io.to(`user:${order.cliente_id}`).emit('ubicacion_repartidor', locationPayload);
      io.to(`empresa:${user.empresa_id}:admins`).emit('ubicacion_repartidor', locationPayload);
      io.to(`empresa:${user.empresa_id}:admins`).emit('pedido_actualizado', {
        pedidoId: orderId,
        estado: order.estado
      });
      if (stop?.ruta_id) {
        io.to(`empresa:${user.empresa_id}`).emit('ruta_actualizada', {
          rutaId: stop.ruta_id,
          paradaId: stop.id
        });
      }
      return acknowledge({ ok: true });
    } catch (error) {
      logger.error('driver_location_failed', { error, userId: user.id, orderId });
      return acknowledge({ ok: false, error: 'No fue posible compartir la ubicación' });
    }
  });
});

const start = async () => {
  await db.initializeDatabase();
  scheduleMaintenance();
  return new Promise((resolve) => {
    server.listen(env.port, () => {
      logger.info('server_started', { port: env.port, environment: env.nodeEnv });
      resolve(server);
    });
  });
};

if (require.main === module) {
  start().catch((error) => {
    logger.error('server_start_failed', { error });
    process.exitCode = 1;
  });
}

let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('server_shutdown_started', { signal });
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();
  io.close();
  server.close(async () => {
    await db.end();
    clearTimeout(forceExit);
    logger.info('server_shutdown_completed', { signal });
    process.exit(0);
  });
};

if (require.main === module) {
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

module.exports = { app, server, start, io, isAllowedOrigin, shutdown };
