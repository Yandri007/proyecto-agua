const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, query, param, validationResult } = require('express-validator');
const pool = require('../config/database');
const env = require('../config/env');
const { verifyToken, checkRole } = require('../middleware/auth');
const { normalizeSlug, seedDefaultProducts } = require('../utils/tenant');
const { createUserToken, findValidToken } = require('../utils/accountTokens');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const { writeAudit } = require('../utils/audit');
const { getPlan, requireActiveSubscription } = require('../utils/plans');
const logger = require('../utils/logger');
const { getCompanyModules } = require('../utils/modules');
const { buildClientPortalUrl, verifyClientInvite } = require('../utils/clientInvites');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: { error: 'Se alcanzó el límite temporal de registros.' },
  standardHeaders: true,
  legacyHeaders: false
});

const accountRecoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: { error: 'Espera antes de solicitar otro enlace.' },
  standardHeaders: true,
  legacyHeaders: false
});

const cookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: 8 * 60 * 60 * 1000
};

const publicUser = (user) => ({
  id: user.id,
  nombre: user.nombre,
  email: user.email,
  email_verificado: Boolean(user.email_verificado_en),
  acceso_cliente_autorizado: Boolean(user.acceso_cliente_autorizado_en),
  ubicacion_consentida: Boolean(user.ubicacion_consentida_en),
  rol: user.rol,
  empresa: {
    id: user.empresa_id,
    nombre: user.empresa_nombre,
    slug: user.empresa_slug,
    plan: user.empresa_plan,
    prueba_hasta: user.empresa_prueba_hasta,
    suscripcion_estado: user.empresa_suscripcion_estado,
    periodo_hasta: user.empresa_periodo_hasta,
    modulos: getCompanyModules(user.empresa_modulos)
  }
});

const issueSession = (res, user) => {
  const token = jwt.sign(
    { id: user.id, sv: user.sesion_version },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn, issuer: 'aquacontrol', audience: 'aquacontrol-web' }
  );
  res.cookie(env.sessionCookie, token, cookieOptions);
};

const clearSession = (res) => {
  res.clearCookie(env.sessionCookie, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/'
  });
};

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  return next();
};

const userValidators = [
  body('nombre')
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres')
    .matches(/^[\p{L}\p{M} .'-]+$/u).withMessage('El nombre contiene caracteres no permitidos'),
  body('email').trim().isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password')
    .isLength({ min: 10, max: 128 }).withMessage('La contraseña debe tener entre 10 y 128 caracteres'),
  body('telefono')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9+() -]{7,20}$/).withMessage('Teléfono inválido')
];

const enrichUserWithCompany = (user, company) => ({
  ...user,
  empresa_nombre: company.nombre,
  empresa_slug: company.slug,
  empresa_plan: company.plan,
  empresa_prueba_hasta: company.prueba_hasta,
  empresa_suscripcion_estado: company.suscripcion_estado,
  empresa_periodo_hasta: company.periodo_hasta,
  empresa_modulos: company.modulos
});

const deliverVerification = async (user, token) => {
  try {
    return await sendVerificationEmail({ user, token });
  } catch (error) {
    logger.error('verification_email_failed', { error, userId: user.id });
    return { delivered: false };
  }
};

router.post(
  '/register-empresa',
  registerLimiter,
  body('empresa_nombre')
    .trim()
    .isLength({ min: 2, max: 120 }).withMessage('El nombre de la empresa debe tener entre 2 y 120 caracteres'),
  body('empresa_slug')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .matches(/^[a-z0-9-]{2,80}$/).withMessage('El código de empresa solo puede usar letras, números y guiones'),
  ...userValidators,
  handleValidation,
  async (req, res) => {
    const {
      empresa_nombre: empresaNombre,
      nombre,
      email,
      password,
      telefono
    } = req.body;
    const empresaSlug = normalizeSlug(req.body.empresa_slug || empresaNombre);
    if (empresaSlug.length < 2) {
      return res.status(400).json({ error: 'Elige un código de empresa válido' });
    }

    const client = await pool.connect();
    let transactionStarted = false;
    try {
      const hashedPassword = await bcrypt.hash(password, 12);
      await client.query('BEGIN');
      transactionStarted = true;

      const companyResult = await client.query(
        `INSERT INTO empresas (nombre, slug)
         VALUES ($1, $2)
         RETURNING id, nombre, slug, plan, prueba_hasta,
                   suscripcion_estado, periodo_hasta`,
        [empresaNombre, empresaSlug]
      );
      const company = companyResult.rows[0];
      const userResult = await client.query(
        `INSERT INTO usuarios
          (empresa_id, nombre, email, password, telefono, rol)
         VALUES ($1, $2, $3, $4, $5, 'admin')
         RETURNING id, nombre, email, rol, empresa_id,
                   email_verificado_en, sesion_version`,
        [company.id, nombre, email, hashedPassword, telefono || null]
      );
      const user = enrichUserWithCompany(userResult.rows[0], company);
      const verificationToken = await createUserToken(client, user.id, 'verificacion_email', 24 * 60);
      await seedDefaultProducts(client, company.id);
      await writeAudit({
        client,
        req,
        user,
        empresaId: company.id,
        action: 'empresa.creada',
        entity: 'empresas',
        entityId: company.id
      });
      await client.query('COMMIT');
      transactionStarted = false;

      const emailResult = await deliverVerification(user, verificationToken);
      return res.status(201).json({
        message: 'Tu distribuidora está lista. Verifica tu correo para ingresar.',
        requires_email_verification: true,
        email_sent: emailResult.delivered,
        development_url: emailResult.developmentUrl
      });
    } catch (error) {
      if (transactionStarted) await client.query('ROLLBACK');
      if (error.code === '23505') {
        const duplicateSlug = error.constraint?.includes('slug');
        return res.status(409).json({
          error: duplicateSlug
            ? 'Ese código de empresa ya está en uso'
            : 'El email ya está registrado'
        });
      }
      logger.error('company_registration_failed', { error });
      return res.status(500).json({ error: 'No fue posible crear la distribuidora' });
    } finally {
      client.release();
    }
  }
);

router.post(
  '/register',
  registerLimiter,
  ...userValidators,
  body('empresa_slug')
    .trim()
    .matches(/^[a-z0-9-]{2,80}$/).withMessage('Código de empresa inválido'),
  body('direccion').optional({ checkFalsy: true }).trim().isLength({ max: 300 }),
  body('invite_token').optional({ checkFalsy: true }).isString().isLength({ min: 20, max: 1000 })
    .withMessage('Invitación de clientes inválida'),
  handleValidation,
  async (req, res) => {
    const {
      nombre,
      email,
      password,
      telefono,
      direccion,
      invite_token: inviteToken,
      empresa_slug: empresaSlug
    } = req.body;
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      const companyResult = await client.query(
        `SELECT id, nombre, slug, plan, prueba_hasta,
                suscripcion_estado, periodo_hasta, modulos,
                registro_clientes_version
         FROM empresas
         WHERE slug = $1
           AND estado = 'activa'
           AND registro_clientes_habilitado = TRUE`,
        [empresaSlug.toLowerCase()]
      );
      if (companyResult.rowCount === 0) {
        return res.status(404).json({ error: 'Código de empresa no válido' });
      }

      const company = companyResult.rows[0];
      const invitedClient = inviteToken ? verifyClientInvite(inviteToken, company) : false;
      if (inviteToken && !invitedClient) {
        return res.status(403).json({ error: 'El enlace de clientes venció o fue reemplazado' });
      }
      const hashedPassword = await bcrypt.hash(password, 12);
      await client.query('BEGIN');
      transactionStarted = true;
      const result = await client.query(
        `INSERT INTO usuarios
          (empresa_id, nombre, email, password, telefono, direccion, rol,
           acceso_cliente_autorizado_en)
         VALUES ($1, $2, $3, $4, $5, $6, 'cliente',
                 CASE WHEN $7::boolean THEN CURRENT_TIMESTAMP ELSE NULL END)
         RETURNING id, nombre, email, rol, empresa_id,
                   email_verificado_en, acceso_cliente_autorizado_en, sesion_version`,
        [
          company.id,
          nombre,
          email,
          hashedPassword,
          telefono || null,
          direccion || null,
          invitedClient
        ]
      );
      const user = enrichUserWithCompany(result.rows[0], company);
      const verificationToken = invitedClient
        ? null
        : await createUserToken(client, user.id, 'verificacion_email', 24 * 60);
      if (invitedClient) {
        await writeAudit({
          client,
          req,
          user,
          empresaId: company.id,
          action: 'cliente.registrado_portal',
          entity: 'usuarios',
          entityId: user.id,
          details: { canal: 'enlace_empresa' }
        });
      }
      await client.query('COMMIT');
      transactionStarted = false;

      if (invitedClient) {
        const io = req.app?.get?.('io');
        if (io) {
          io.to(`empresa:${company.id}`).emit('operacion_actualizada', {
            recurso: '/api/auth',
            accion: 'POST',
            actorRol: 'cliente',
            actualizadoEn: new Date().toISOString()
          });
        }
        issueSession(res, user);
        return res.status(201).json({
          message: 'Cuenta creada. Ya puedes realizar tus pedidos.',
          can_login: true,
          user: publicUser(user)
        });
      }
      const emailResult = await deliverVerification(user, verificationToken);
      return res.status(201).json({
        message: 'Cuenta creada. Verifica tu correo para ingresar.',
        requires_email_verification: true,
        email_sent: emailResult.delivered,
        development_url: emailResult.developmentUrl
      });
    } catch (error) {
      if (transactionStarted) await client.query('ROLLBACK');
      if (error.code === '23505') {
        return res.status(409).json({ error: 'El email ya está registrado' });
      }
      logger.error('client_registration_failed', { error });
      return res.status(500).json({ error: 'No fue posible crear la cuenta' });
    } finally {
      client.release();
    }
  }
);

router.post(
  '/verify-email',
  registerLimiter,
  body('token').isString().isLength({ min: 20, max: 200 }).withMessage('Enlace de verificación inválido'),
  handleValidation,
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tokenRecord = await findValidToken(client, req.body.token, 'verificacion_email');
      if (!tokenRecord) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'El enlace venció o ya fue utilizado' });
      }
      await client.query(
        `UPDATE usuarios
         SET email_verificado_en = COALESCE(email_verificado_en, CURRENT_TIMESTAMP)
         WHERE id = $1`,
        [tokenRecord.usuario_id]
      );
      await client.query(
        'UPDATE tokens_usuarios SET usado_en = CURRENT_TIMESTAMP WHERE id = $1',
        [tokenRecord.id]
      );
      await client.query('COMMIT');
      await writeAudit({
        req,
        empresaId: tokenRecord.empresa_id,
        action: 'usuario.email_verificado',
        entity: 'usuarios',
        entityId: tokenRecord.usuario_id
      });
      return res.json({ message: 'Correo verificado. Ya puedes iniciar sesión.' });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('email_verification_failed', { error });
      return res.status(500).json({ error: 'No fue posible verificar el correo' });
    } finally {
      client.release();
    }
  }
);

router.post(
  '/resend-verification',
  accountRecoveryLimiter,
  body('email').trim().isEmail().withMessage('Email inválido').normalizeEmail(),
  handleValidation,
  async (req, res) => {
    let developmentUrl;
    try {
      const result = await pool.query(
        `SELECT id, nombre, email
         FROM usuarios
         WHERE email = $1 AND estado = 'activo' AND email_verificado_en IS NULL`,
        [req.body.email]
      );
      const user = result.rows[0];
      if (user) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const token = await createUserToken(client, user.id, 'verificacion_email', 24 * 60);
          await client.query('COMMIT');
          const emailResult = await deliverVerification(user, token);
          developmentUrl = emailResult.developmentUrl;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
    } catch (error) {
      logger.error('verification_resend_failed', { error });
    }
    return res.json({
      message: 'Si la cuenta está pendiente y el correo está disponible, recibirás un nuevo enlace.',
      development_url: developmentUrl
    });
  }
);

router.post(
  '/forgot-password',
  accountRecoveryLimiter,
  body('email').trim().isEmail().withMessage('Email inválido').normalizeEmail(),
  handleValidation,
  async (req, res) => {
    let developmentUrl;
    try {
      const result = await pool.query(
        `SELECT id, nombre, email
         FROM usuarios
         WHERE email = $1 AND estado = 'activo'`,
        [req.body.email]
      );
      const user = result.rows[0];
      if (user) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const token = await createUserToken(client, user.id, 'restablecer_password', 30);
          await client.query('COMMIT');
          const emailResult = await sendPasswordResetEmail({ user, token });
          developmentUrl = emailResult.developmentUrl;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
    } catch (error) {
      logger.error('password_reset_request_failed', { error });
    }
    return res.json({
      message: 'Si el correo está registrado, recibirás un enlace de recuperación.',
      development_url: env.nodeEnv === 'development' ? developmentUrl : undefined
    });
  }
);

router.post(
  '/reset-password',
  accountRecoveryLimiter,
  body('token').isString().isLength({ min: 20, max: 200 }).withMessage('Enlace inválido'),
  body('password')
    .isLength({ min: 10, max: 128 }).withMessage('La contraseña debe tener entre 10 y 128 caracteres'),
  handleValidation,
  async (req, res) => {
    const client = await pool.connect();
    try {
      const hashedPassword = await bcrypt.hash(req.body.password, 12);
      await client.query('BEGIN');
      const tokenRecord = await findValidToken(client, req.body.token, 'restablecer_password');
      if (!tokenRecord) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'El enlace venció o ya fue utilizado' });
      }
      await client.query(
        `UPDATE usuarios
         SET password = $1,
             email_verificado_en = COALESCE(email_verificado_en, CURRENT_TIMESTAMP),
             sesion_version = sesion_version + 1
         WHERE id = $2`,
        [hashedPassword, tokenRecord.usuario_id]
      );
      await client.query(
        `UPDATE tokens_usuarios
         SET usado_en = CURRENT_TIMESTAMP
         WHERE usuario_id = $1 AND usado_en IS NULL`,
        [tokenRecord.usuario_id]
      );
      await client.query('COMMIT');
      clearSession(res);
      await writeAudit({
        req,
        empresaId: tokenRecord.empresa_id,
        action: 'usuario.password_restablecido',
        entity: 'usuarios',
        entityId: tokenRecord.usuario_id
      });
      return res.json({ message: 'Contraseña actualizada. Inicia sesión nuevamente.' });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('password_reset_failed', { error });
      return res.status(500).json({ error: 'No fue posible cambiar la contraseña' });
    } finally {
      client.release();
    }
  }
);

router.post(
  '/login',
  loginLimiter,
  body('email').trim().isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password').isString().notEmpty().withMessage('La contraseña es requerida'),
  handleValidation,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const result = await pool.query(
        `SELECT u.id, u.nombre, u.email, u.password, u.rol, u.empresa_id,
                u.email_verificado_en, u.acceso_cliente_autorizado_en,
                u.sesion_version, u.ubicacion_consentida_en,
                e.nombre AS empresa_nombre, e.slug AS empresa_slug,
                e.plan AS empresa_plan, e.prueba_hasta AS empresa_prueba_hasta,
                e.suscripcion_estado AS empresa_suscripcion_estado,
                e.periodo_hasta AS empresa_periodo_hasta,
                e.modulos AS empresa_modulos
         FROM usuarios u
         JOIN empresas e ON e.id = u.empresa_id
         WHERE u.email = $1 AND u.estado = 'activo' AND e.estado = 'activa'`,
        [email]
      );
      const user = result.rows[0];
      const validPassword = user ? await bcrypt.compare(password, user.password) : false;
      if (!user || !validPassword) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }
      const clientAccessApproved = user.rol === 'cliente' && user.acceso_cliente_autorizado_en;
      if (!user.email_verificado_en && !clientAccessApproved) {
        return res.status(403).json({
          error: 'Verifica tu correo antes de iniciar sesión',
          code: 'EMAIL_NOT_VERIFIED'
        });
      }

      await pool.query('UPDATE usuarios SET ultimo_acceso_en = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
      issueSession(res, user);
      await writeAudit({
        req,
        user,
        action: 'usuario.login',
        entity: 'usuarios',
        entityId: user.id
      });
      return res.json({ user: publicUser(user) });
    } catch (error) {
      logger.error('login_failed', { error });
      return res.status(500).json({ error: 'No fue posible iniciar sesión' });
    }
  }
);

router.get('/me', verifyToken, (req, res) => {
  return res.json({ user: publicUser(req.user) });
});

router.post('/logout', (req, res) => {
  clearSession(res);
  return res.json({ message: 'Sesión cerrada' });
});

router.post('/logout-all', verifyToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE usuarios SET sesion_version = sesion_version + 1 WHERE id = $1',
      [req.user.id]
    );
    clearSession(res);
    return res.json({ message: 'Todas las sesiones fueron cerradas' });
  } catch (error) {
    return res.status(500).json({ error: 'No fue posible cerrar las sesiones' });
  }
});

router.get('/empresa', verifyToken, checkRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, slug, estado, plan, suscripcion_estado,
              prueba_hasta, periodo_hasta, proveedor_pago,
              registro_clientes_habilitado, modulos, creado_en
       FROM empresas
       WHERE id = $1`,
      [req.user.empresa_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    logger.error('company_read_failed', { error, companyId: req.user.empresa_id });
    return res.status(500).json({ error: 'No fue posible cargar los datos de la empresa' });
  }
});

router.get(
  '/client-portal',
  verifyToken,
  checkRole(['admin']),
  requireActiveSubscription,
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT e.id, e.nombre, e.slug, e.registro_clientes_habilitado,
                e.registro_clientes_version,
                COUNT(u.id) FILTER (WHERE u.rol = 'cliente' AND u.estado = 'activo')::INT AS clientes_activos
         FROM empresas e
         LEFT JOIN usuarios u ON u.empresa_id = e.id
         WHERE e.id = $1
         GROUP BY e.id`,
        [req.user.empresa_id]
      );
      const company = result.rows[0];
      if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
      res.set('Cache-Control', 'no-store');
      return res.json({
        enabled: company.registro_clientes_habilitado,
        client_portal_url: company.registro_clientes_habilitado
          ? buildClientPortalUrl(company)
          : null,
        clientes_activos: company.clientes_activos
      });
    } catch (error) {
      logger.error('client_portal_read_failed', { error, companyId: req.user.empresa_id });
      return res.status(500).json({ error: 'No fue posible cargar el portal de clientes' });
    }
  }
);

router.post(
  '/client-portal/rotate',
  verifyToken,
  checkRole(['admin']),
  requireActiveSubscription,
  async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE empresas
         SET registro_clientes_version = registro_clientes_version + 1
         WHERE id = $1 AND estado = 'activa' AND registro_clientes_habilitado = TRUE
         RETURNING id, nombre, slug, registro_clientes_habilitado,
                   registro_clientes_version`,
        [req.user.empresa_id]
      );
      const company = result.rows[0];
      if (!company) {
        return res.status(409).json({ error: 'El registro de clientes no está habilitado' });
      }
      await writeAudit({
        req,
        action: 'clientes.enlace_renovado',
        entity: 'empresas',
        entityId: company.id,
        details: { version: company.registro_clientes_version }
      });
      res.set('Cache-Control', 'no-store');
      return res.json({
        enabled: true,
        client_portal_url: buildClientPortalUrl(company)
      });
    } catch (error) {
      logger.error('client_portal_rotate_failed', { error, companyId: req.user.empresa_id });
      return res.status(500).json({ error: 'No fue posible renovar el enlace de clientes' });
    }
  }
);

router.get(
  '/clientes',
  verifyToken,
  checkRole(['admin']),
  requireActiveSubscription,
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT u.id, u.nombre, u.email, u.telefono,
                COALESCE((
                  SELECT dc.direccion FROM direcciones_clientes dc
                  WHERE dc.empresa_id = u.empresa_id AND dc.cliente_id = u.id
                  ORDER BY dc.es_predeterminada DESC, dc.creado_en LIMIT 1
                ), u.direccion) AS direccion,
                (SELECT COUNT(*)::INT FROM direcciones_clientes dc
                 WHERE dc.empresa_id = u.empresa_id AND dc.cliente_id = u.id) AS direcciones_total,
                u.estado,
                u.email_verificado_en, u.acceso_cliente_autorizado_en,
                u.ultimo_acceso_en, u.creado_en,
                COUNT(p.id)::INT AS pedidos_total,
                COALESCE(SUM(p.total) FILTER (WHERE p.estado <> 'cancelado'), 0)::NUMERIC AS total_pedidos
         FROM usuarios u
         LEFT JOIN pedidos p ON p.cliente_id = u.id AND p.empresa_id = u.empresa_id
         WHERE u.empresa_id = $1 AND u.rol = 'cliente'
         GROUP BY u.id
         ORDER BY u.creado_en DESC`,
        [req.user.empresa_id]
      );
      return res.json(result.rows);
    } catch (error) {
      logger.error('clients_read_failed', { error, companyId: req.user.empresa_id });
      return res.status(500).json({ error: 'No fue posible cargar los clientes' });
    }
  }
);

router.patch(
  '/clientes/:id/status',
  verifyToken,
  checkRole(['admin']),
  requireActiveSubscription,
  param('id').isInt({ min: 1 }).withMessage('Cliente inválido').toInt(),
  body('estado').isIn(['activo', 'inactivo']).withMessage('Estado de cliente inválido'),
  handleValidation,
  async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE usuarios
         SET estado = $1, sesion_version = sesion_version + 1
         WHERE id = $2 AND empresa_id = $3 AND rol = 'cliente'
         RETURNING id, nombre, email, estado`,
        [req.body.estado, req.params.id, req.user.empresa_id]
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
      await writeAudit({
        req,
        action: `cliente.${req.body.estado === 'activo' ? 'activado' : 'desactivado'}`,
        entity: 'usuarios',
        entityId: req.params.id,
        details: { estado: req.body.estado }
      });
      return res.json(result.rows[0]);
    } catch (error) {
      logger.error('client_status_update_failed', {
        error,
        companyId: req.user.empresa_id,
        clientId: req.params.id
      });
      return res.status(500).json({ error: 'No fue posible actualizar el cliente' });
    }
  }
);

router.get('/repartidores', verifyToken, checkRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, email, telefono, email_verificado_en
       FROM usuarios
       WHERE empresa_id = $1 AND rol = 'repartidor' AND estado = 'activo'
       ORDER BY nombre`,
      [req.user.empresa_id]
    );
    return res.json(result.rows);
  } catch (error) {
    logger.error('drivers_read_failed', { error, companyId: req.user.empresa_id });
    return res.status(500).json({ error: 'No fue posible cargar los repartidores' });
  }
});

router.post(
  '/repartidores/:id/resend-verification',
  verifyToken,
  checkRole(['admin']),
  accountRecoveryLimiter,
  param('id').isInt({ min: 1 }).withMessage('Repartidor invalido'),
  handleValidation,
  async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      const result = await client.query(
        `SELECT id, nombre, email, email_verificado_en
         FROM usuarios
         WHERE id = $1 AND empresa_id = $2
           AND rol = 'repartidor' AND estado = 'activo'`,
        [Number(req.params.id), req.user.empresa_id]
      );
      const user = result.rows[0];
      if (!user) {
        return res.status(404).json({ error: 'Repartidor no encontrado' });
      }
      if (user.email_verificado_en) {
        return res.status(409).json({ error: 'El repartidor ya verifico su correo' });
      }

      await client.query('BEGIN');
      transactionStarted = true;
      const token = await createUserToken(client, user.id, 'verificacion_email', 24 * 60);
      await client.query('COMMIT');
      transactionStarted = false;

      const emailResult = await deliverVerification(user, token);
      await writeAudit({
        req,
        user: req.user,
        empresaId: req.user.empresa_id,
        action: 'repartidor.verificacion_reenviada',
        entity: 'usuarios',
        entityId: user.id,
        details: { entregado_proveedor: emailResult.delivered }
      });
      return res.json({
        message: emailResult.delivered
          ? 'Enlace de acceso enviado al repartidor.'
          : 'No se pudo enviar el correo. Revisa la configuracion del proveedor.',
        email_sent: emailResult.delivered,
        development_url: emailResult.developmentUrl
      });
    } catch (error) {
      if (transactionStarted) await client.query('ROLLBACK');
      logger.error('driver_verification_resend_failed', {
        error,
        companyId: req.user.empresa_id,
        driverId: req.params.id
      });
      return res.status(500).json({ error: 'No fue posible generar un nuevo enlace' });
    } finally {
      client.release();
    }
  }
);

router.post(
  '/repartidores',
  verifyToken,
  checkRole(['admin']),
  requireActiveSubscription,
  ...userValidators,
  handleValidation,
  async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      const effectivePlan = req.user.empresa_plan === 'prueba'
        ? getPlan('profesional')
        : getPlan(req.user.empresa_plan);
      const countResult = await client.query(
        `SELECT COUNT(*)::INT AS total
         FROM usuarios
         WHERE empresa_id = $1 AND rol = 'repartidor' AND estado = 'activo'`,
        [req.user.empresa_id]
      );
      if (effectivePlan.limits.drivers !== null
          && countResult.rows[0].total >= effectivePlan.limits.drivers) {
        return res.status(409).json({
          error: `El plan permite hasta ${effectivePlan.limits.drivers} repartidores`,
          code: 'PLAN_LIMIT_REACHED'
        });
      }

      const { nombre, email, password, telefono } = req.body;
      const hashedPassword = await bcrypt.hash(password, 12);
      await client.query('BEGIN');
      transactionStarted = true;
      const result = await client.query(
        `INSERT INTO usuarios
          (empresa_id, nombre, email, password, telefono, rol)
         VALUES ($1, $2, $3, $4, $5, 'repartidor')
         RETURNING id, nombre, email, telefono, empresa_id`,
        [req.user.empresa_id, nombre, email, hashedPassword, telefono || null]
      );
      const user = result.rows[0];
      const verificationToken = await createUserToken(client, user.id, 'verificacion_email', 24 * 60);
      await client.query('COMMIT');
      transactionStarted = false;
      const emailResult = await deliverVerification(user, verificationToken);
      return res.status(201).json({
        ...user,
        email_verificado_en: null,
        email_sent: emailResult.delivered,
        message: emailResult.delivered
          ? 'Repartidor creado. Enlace de acceso enviado.'
          : 'Repartidor creado, pero el correo no pudo enviarse.',
        development_url: emailResult.developmentUrl
      });
    } catch (error) {
      if (transactionStarted) await client.query('ROLLBACK');
      if (error.code === '23505') {
        return res.status(409).json({ error: 'El email ya está registrado' });
      }
      logger.error('driver_creation_failed', { error });
      return res.status(500).json({ error: 'No fue posible crear el repartidor' });
    } finally {
      client.release();
    }
  }
);

router.delete('/repartidor/:id', verifyToken, checkRole(['admin']), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Repartidor inválido' });
  }
  try {
    const activeOrders = await pool.query(
      `SELECT 1 FROM pedidos
       WHERE empresa_id = $1 AND repartidor_id = $2
         AND estado IN ('asignado', 'en_camino')
       LIMIT 1`,
      [req.user.empresa_id, id]
    );
    if (activeOrders.rowCount > 0) {
      return res.status(409).json({
        error: 'Reasigna los pedidos activos antes de desactivar al repartidor'
      });
    }
    const result = await pool.query(
      `UPDATE usuarios
       SET estado = 'inactivo', sesion_version = sesion_version + 1
       WHERE id = $1 AND empresa_id = $2 AND rol = 'repartidor'
       RETURNING id`,
      [id, req.user.empresa_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Repartidor no encontrado' });
    }
    return res.json({ message: 'Repartidor desactivado' });
  } catch (error) {
    logger.error('driver_deactivation_failed', { error, driverId: id });
    return res.status(500).json({ error: 'No fue posible desactivar al repartidor' });
  }
});

router.post(
  '/ubicacion/consentimiento',
  verifyToken,
  checkRole(['repartidor']),
  body('aceptado').isBoolean().withMessage('Consentimiento inválido'),
  handleValidation,
  async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE usuarios
         SET ubicacion_consentida_en = CASE
           WHEN $1::boolean THEN CURRENT_TIMESTAMP
           ELSE NULL
         END
         WHERE id = $2
         RETURNING ubicacion_consentida_en`,
        [req.body.aceptado, req.user.id]
      );
      return res.json({
        aceptado: Boolean(result.rows[0].ubicacion_consentida_en),
        fecha: result.rows[0].ubicacion_consentida_en
      });
    } catch (error) {
      return res.status(500).json({ error: 'No fue posible guardar el consentimiento' });
    }
  }
);

router.get(
  '/auditoria',
  verifyToken,
  checkRole(['admin']),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  handleValidation,
  async (req, res) => {
    try {
      const limit = Number(req.query.limit || 100);
      const result = await pool.query(
        `SELECT a.id, a.accion, a.entidad, a.entidad_id,
                a.detalles, a.direccion_ip, a.creado_en,
                u.nombre AS usuario_nombre
         FROM auditoria a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         WHERE a.empresa_id = $1
         ORDER BY a.creado_en DESC
         LIMIT $2`,
        [req.user.empresa_id, limit]
      );
      return res.json(result.rows);
    } catch (error) {
      return res.status(500).json({ error: 'No fue posible cargar la auditoría' });
    }
  }
);

module.exports = router;
