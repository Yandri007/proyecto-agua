const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, query, param, validationResult } = require('express-validator');
const pool = require('../config/database');
const env = require('../config/env');
const { verifyPlatformToken, requireCurrentPlatformPassword } = require('../middleware/platformAuth');
const logger = require('../utils/logger');
const { PLANS } = require('../utils/plans');
const { createUserToken } = require('../utils/accountTokens');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

const pilotAccessLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: { error: 'Se alcanzó el límite de activaciones. Espera una hora.' },
  standardHeaders: true,
  legacyHeaders: false
});

const cookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: 4 * 60 * 60 * 1000
};

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  return next();
};

const publicAdmin = (admin) => ({
  id: admin.id,
  nombre: admin.nombre,
  email: admin.email,
  debe_cambiar_password: Boolean(admin.debe_cambiar_password),
  ultimo_acceso_en: admin.ultimo_acceso_en
});

const issuePlatformSession = (res, admin) => {
  const token = jwt.sign(
    { id: admin.id, sv: admin.sesion_version, kind: 'platform' },
    env.jwtSecret,
    { expiresIn: '4h', issuer: 'aquacontrol', audience: 'aquacontrol-platform' }
  );
  res.cookie(env.platformSessionCookie, token, cookieOptions);
};

const auditPlatform = async ({ adminId, companyId = null, action, details = {} }) => {
  await pool.query(
    `INSERT INTO auditoria_plataforma (administrador_id, empresa_id, accion, detalles)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [adminId, companyId, action, JSON.stringify(details)]
  );
};

router.post(
  '/login',
  loginLimiter,
  body('email').trim().isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password').isString().notEmpty().withMessage('La contraseña es requerida'),
  handleValidation,
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, nombre, email, password, sesion_version, debe_cambiar_password, ultimo_acceso_en
         FROM administradores_plataforma
         WHERE email = $1 AND estado = 'activo'`,
        [req.body.email]
      );
      const admin = result.rows[0];
      const passwordIsValid = admin ? await bcrypt.compare(req.body.password, admin.password) : false;
      if (!admin || !passwordIsValid) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      await pool.query(
        'UPDATE administradores_plataforma SET ultimo_acceso_en = CURRENT_TIMESTAMP WHERE id = $1',
        [admin.id]
      );
      issuePlatformSession(res, admin);
      await auditPlatform({ adminId: admin.id, action: 'plataforma.login' });
      return res.json({ admin: publicAdmin(admin) });
    } catch (error) {
      logger.error('platform_login_failed', { error });
      return res.status(500).json({ error: 'No fue posible iniciar sesión' });
    }
  }
);

router.get('/me', verifyPlatformToken, (req, res) => {
  return res.json({ admin: publicAdmin(req.platformAdmin) });
});

router.post('/logout', (req, res) => {
  res.clearCookie(env.platformSessionCookie, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/'
  });
  return res.json({ message: 'Sesión cerrada' });
});

router.post(
  '/change-password',
  verifyPlatformToken,
  body('password_actual').isString().notEmpty().withMessage('La contraseña actual es requerida'),
  body('password_nueva')
    .isLength({ min: 14, max: 128 }).withMessage('La nueva contraseña debe tener entre 14 y 128 caracteres')
    .matches(/[a-z]/).withMessage('Incluye al menos una minúscula')
    .matches(/[A-Z]/).withMessage('Incluye al menos una mayúscula')
    .matches(/[0-9]/).withMessage('Incluye al menos un número'),
  handleValidation,
  async (req, res) => {
    try {
      const current = await pool.query(
        'SELECT password FROM administradores_plataforma WHERE id = $1',
        [req.platformAdmin.id]
      );
      const valid = current.rows[0]
        ? await bcrypt.compare(req.body.password_actual, current.rows[0].password)
        : false;
      if (!valid) return res.status(400).json({ error: 'La contraseña actual no es correcta' });

      const hash = await bcrypt.hash(req.body.password_nueva, 12);
      const updated = await pool.query(
        `UPDATE administradores_plataforma
         SET password = $1, debe_cambiar_password = FALSE, sesion_version = sesion_version + 1
         WHERE id = $2
         RETURNING id, nombre, email, sesion_version, debe_cambiar_password, ultimo_acceso_en`,
        [hash, req.platformAdmin.id]
      );
      issuePlatformSession(res, updated.rows[0]);
      await auditPlatform({ adminId: req.platformAdmin.id, action: 'plataforma.password_actualizada' });
      return res.json({ admin: publicAdmin(updated.rows[0]) });
    } catch (error) {
      logger.error('platform_password_change_failed', { error, adminId: req.platformAdmin.id });
      return res.status(500).json({ error: 'No fue posible actualizar la contraseña' });
    }
  }
);

router.use(verifyPlatformToken, requireCurrentPlatformPassword);

router.get('/summary', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::INT AS empresas_total,
        COUNT(*) FILTER (WHERE estado = 'activa')::INT AS empresas_activas,
        COUNT(*) FILTER (WHERE estado = 'activa' AND suscripcion_estado = 'prueba'
          AND prueba_hasta >= CURRENT_TIMESTAMP)::INT AS pruebas_activas,
        COUNT(*) FILTER (WHERE estado = 'activa' AND suscripcion_estado = 'activa')::INT AS suscripciones_activas,
        COUNT(*) FILTER (WHERE estado <> 'activa' OR suscripcion_estado IN ('vencida', 'cancelada'))::INT AS requieren_atencion,
        COALESCE(SUM(CASE WHEN estado = 'activa' AND suscripcion_estado = 'activa' AND plan = 'basico' THEN $1
                          WHEN estado = 'activa' AND suscripcion_estado = 'activa' AND plan = 'profesional' THEN $2
                          ELSE 0 END), 0)::NUMERIC AS ingreso_mensual_estimado,
        (SELECT COUNT(*)::INT FROM usuarios WHERE estado = 'activo') AS usuarios_activos,
        (SELECT COUNT(*)::INT
         FROM usuarios up
         JOIN empresas ep ON ep.id = up.empresa_id
         WHERE up.estado = 'activo' AND up.email_verificado_en IS NULL
           AND ep.estado = 'activa') AS activaciones_pendientes,
        (SELECT COUNT(*)::INT FROM pedidos WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') AS pedidos_30d
      FROM empresas
    `, [PLANS.basico.price, PLANS.profesional.price]);
    return res.json(result.rows[0]);
  } catch (error) {
    logger.error('platform_summary_failed', { error });
    return res.status(500).json({ error: 'No fue posible cargar el resumen' });
  }
});

router.get(
  '/companies',
  query('q').optional().trim().isLength({ max: 100 }).withMessage('Búsqueda demasiado larga'),
  query('estado').optional().isIn(['activa', 'suspendida', 'archivada']).withMessage('Estado inválido'),
  handleValidation,
  async (req, res) => {
    try {
      const search = req.query.q ? `%${req.query.q}%` : null;
      const result = await pool.query(
        `SELECT e.id, e.nombre, e.slug, e.estado, e.plan, e.suscripcion_estado,
                e.prueba_hasta, e.periodo_hasta, e.registro_clientes_habilitado,
                e.modulos, e.creado_en,
                COALESCE(us.usuarios, 0) AS usuarios,
                COALESCE(us.administradores, 0) AS administradores,
                COALESCE(us.repartidores, 0) AS repartidores,
                COALESCE(os.pedidos_mes, 0) AS pedidos_mes,
                us.ultimo_acceso
         FROM empresas e
         LEFT JOIN LATERAL (
           SELECT COUNT(*) FILTER (WHERE estado = 'activo')::INT AS usuarios,
                  COUNT(*) FILTER (WHERE rol = 'admin' AND estado = 'activo')::INT AS administradores,
                  COUNT(*) FILTER (WHERE rol = 'repartidor' AND estado = 'activo')::INT AS repartidores,
                  MAX(ultimo_acceso_en) AS ultimo_acceso
           FROM usuarios WHERE empresa_id = e.id
         ) us ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::INT AS pedidos_mes
           FROM pedidos
           WHERE empresa_id = e.id AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)
         ) os ON TRUE
         WHERE ($1::text IS NULL OR e.nombre ILIKE $1 OR e.slug ILIKE $1)
           AND ($2::text IS NULL OR e.estado = $2)
         ORDER BY e.creado_en DESC`,
        [search, req.query.estado || null]
      );
      return res.json(result.rows);
    } catch (error) {
      logger.error('platform_companies_failed', { error });
      return res.status(500).json({ error: 'No fue posible cargar las empresas' });
    }
  }
);

router.get(
  '/pilot-users',
  query('q').optional().trim().isLength({ max: 100 }).withMessage('Búsqueda demasiado larga'),
  handleValidation,
  async (req, res) => {
    try {
      const search = req.query.q ? `%${req.query.q}%` : null;
      const result = await pool.query(
        `SELECT u.id, u.nombre, u.email, u.telefono, u.rol, u.creado_en,
                e.id AS empresa_id, e.nombre AS empresa, e.slug AS empresa_slug
         FROM usuarios u
         JOIN empresas e ON e.id = u.empresa_id
         WHERE u.estado = 'activo'
           AND u.email_verificado_en IS NULL
           AND e.estado = 'activa'
           AND ($1::text IS NULL OR u.nombre ILIKE $1 OR u.email ILIKE $1
                OR e.nombre ILIKE $1 OR e.slug ILIKE $1)
         ORDER BY u.creado_en ASC
         LIMIT 100`,
        [search]
      );
      res.set('Cache-Control', 'no-store');
      return res.json(result.rows);
    } catch (error) {
      logger.error('platform_pilot_users_failed', { error });
      return res.status(500).json({ error: 'No fue posible cargar las activaciones pendientes' });
    }
  }
);

router.post(
  '/pilot-users/:id/access-link',
  pilotAccessLimiter,
  param('id').isInt({ min: 1 }).withMessage('Usuario inválido').toInt(),
  body('identity_confirmed').equals('true').withMessage('Debes confirmar la identidad del usuario'),
  body('channel').isIn(['whatsapp', 'telefono', 'presencial', 'otro']).withMessage('Canal de confirmación inválido'),
  handleValidation,
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT u.id, u.nombre, u.email, u.rol, u.empresa_id,
                e.nombre AS empresa, e.estado AS empresa_estado
         FROM usuarios u
         JOIN empresas e ON e.id = u.empresa_id
         WHERE u.id = $1 AND u.estado = 'activo' AND u.email_verificado_en IS NULL
         FOR UPDATE OF u`,
        [req.params.id]
      );
      const user = result.rows[0];
      if (!user) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'La cuenta no existe o ya fue activada' });
      }
      if (user.empresa_estado !== 'activa') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'La empresa debe estar activa antes de habilitar usuarios' });
      }

      const token = await createUserToken(client, user.id, 'restablecer_password', 60);
      await client.query(
        `INSERT INTO auditoria_plataforma (administrador_id, empresa_id, accion, detalles)
         VALUES ($1, $2, 'piloto.enlace_acceso_generado', $3::jsonb)`,
        [
          req.platformAdmin.id,
          user.empresa_id,
          JSON.stringify({
            usuario_id: user.id,
            usuario_email: user.email,
            usuario_rol: user.rol,
            canal_confirmacion: req.body.channel,
            expira_en_minutos: 60
          })
        ]
      );
      await client.query('COMMIT');
      res.set('Cache-Control', 'no-store');
      return res.json({
        access_url: `${env.appUrl}/?reset_token=${encodeURIComponent(token)}`,
        expires_in_minutes: 60,
        user: {
          id: user.id,
          nombre: user.nombre,
          email: user.email,
          rol: user.rol,
          empresa: user.empresa
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('platform_pilot_access_link_failed', {
        error,
        userId: req.params.id,
        adminId: req.platformAdmin.id
      });
      return res.status(500).json({ error: 'No fue posible generar el acceso piloto' });
    } finally {
      client.release();
    }
  }
);

router.patch(
  '/companies/:id',
  param('id').isInt({ min: 1 }).withMessage('Empresa inválida').toInt(),
  body('estado').optional().isIn(['activa', 'suspendida', 'archivada']).withMessage('Estado inválido'),
  body('plan').optional().isIn(['prueba', 'basico', 'profesional']).withMessage('Plan inválido'),
  body('suscripcion_estado').optional().isIn(['prueba', 'activa', 'gracia', 'vencida', 'cancelada']).withMessage('Suscripción inválida'),
  body('prueba_hasta').optional().isISO8601().withMessage('Fecha de prueba inválida'),
  body('periodo_hasta').optional({ nullable: true }).isISO8601().withMessage('Fecha de período inválida'),
  body('registro_clientes_habilitado').optional().isBoolean().withMessage('Registro de clientes inválido'),
  body('modulos').optional().isObject().withMessage('Módulos inválidos'),
  handleValidation,
  async (req, res) => {
    const allowedFields = [
      'estado', 'plan', 'suscripcion_estado', 'prueba_hasta', 'periodo_hasta',
      'registro_clientes_habilitado', 'modulos'
    ];
    const changes = allowedFields.filter((field) => Object.hasOwn(req.body, field));
    if (changes.length === 0) return res.status(400).json({ error: 'No hay cambios válidos' });
    if (req.body.suscripcion_estado === 'activa' && req.body.plan === 'prueba') {
      return res.status(400).json({ error: 'Una suscripción activa requiere un plan comercial' });
    }

    if (req.body.suscripcion_estado === 'gracia' && !req.body.periodo_hasta) {
      return res.status(400).json({ error: 'El periodo de gracia requiere una fecha de finalizacion' });
    }

    const moduleNames = ['ventas_ruta', 'recursos_humanos', 'planta', 'logistica'];
    if (req.body.modulos) {
      const invalidModule = Object.keys(req.body.modulos).find((name) => (
        !moduleNames.includes(name) || typeof req.body.modulos[name] !== 'boolean'
      ));
      if (invalidModule) return res.status(400).json({ error: 'Configuración de módulos inválida' });
    }

    const values = changes.map((field) => (
      field === 'modulos' ? JSON.stringify(req.body[field]) : req.body[field]
    ));
    const assignments = changes.map((field, index) => {
      if (field === 'modulos') return `modulos = modulos || $${index + 1}::jsonb`;
      return `${field} = $${index + 1}`;
    });
    values.push(req.params.id);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE empresas SET ${assignments.join(', ')}
         WHERE id = $${values.length}
         RETURNING id, nombre, slug, estado, plan, suscripcion_estado, prueba_hasta,
                   periodo_hasta, registro_clientes_habilitado, modulos, creado_en`,
        values
      );
      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Empresa no encontrada' });
      }
      await client.query(
        `INSERT INTO auditoria_plataforma (administrador_id, empresa_id, accion, detalles)
         VALUES ($1, $2, 'empresa.configurada', $3::jsonb)`,
        [req.platformAdmin.id, req.params.id, JSON.stringify(req.body)]
      );
      await client.query('COMMIT');
      return res.json(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('platform_company_update_failed', { error, companyId: req.params.id });
      return res.status(500).json({ error: 'No fue posible actualizar la empresa' });
    } finally {
      client.release();
    }
  }
);

router.get('/audit', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ap.id, ap.accion, ap.detalles, ap.creado_en,
              adm.nombre AS administrador, e.nombre AS empresa
       FROM auditoria_plataforma ap
       LEFT JOIN administradores_plataforma adm ON adm.id = ap.administrador_id
       LEFT JOIN empresas e ON e.id = ap.empresa_id
       ORDER BY ap.creado_en DESC
       LIMIT 100`
    );
    return res.json(result.rows);
  } catch (error) {
    logger.error('platform_audit_failed', { error });
    return res.status(500).json({ error: 'No fue posible cargar la auditoría' });
  }
});

module.exports = router;
