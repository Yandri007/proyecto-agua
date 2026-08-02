const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const env = require('../config/env');

const parseCookies = (cookieHeader = '') => Object.fromEntries(
  cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      const key = separator === -1 ? part : part.slice(0, separator);
      const value = separator === -1 ? '' : part.slice(separator + 1);
      return [decodeURIComponent(key), decodeURIComponent(value)];
    })
);

const getRequestToken = (req) => {
  const cookieToken = parseCookies(req.headers.cookie)[env.sessionCookie];
  if (cookieToken) return cookieToken;

  const authorization = req.headers.authorization;
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice(7);
  }
  return null;
};

const getActiveUser = async (userId, sessionVersion = null) => {
  const result = await pool.query(
    `SELECT u.id, u.nombre, u.email, u.rol, u.empresa_id,
            u.email_verificado_en, u.sesion_version, u.ubicacion_consentida_en,
            e.nombre AS empresa_nombre, e.slug AS empresa_slug,
            e.plan AS empresa_plan, e.prueba_hasta AS empresa_prueba_hasta,
            e.suscripcion_estado AS empresa_suscripcion_estado,
            e.periodo_hasta AS empresa_periodo_hasta,
            e.modulos AS empresa_modulos
     FROM usuarios u
     JOIN empresas e ON e.id = u.empresa_id
     WHERE u.id = $1
       AND ($2::int IS NULL OR u.sesion_version = $2)
       AND u.estado = 'activo'
       AND e.estado = 'activa'`,
    [userId, sessionVersion]
  );
  return result.rows[0] || null;
};

const verifyToken = async (req, res, next) => {
  const token = getRequestToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Debes iniciar sesión' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      issuer: 'aquacontrol',
      audience: 'aquacontrol-web'
    });
    const user = await getActiveUser(payload.id, payload.sv);
    if (!user) {
      return res.status(401).json({ error: 'La sesión ya no es válida' });
    }
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
};

const checkRole = (rolesPermitidos) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (!rolesPermitidos.includes(req.user.rol)) {
    return res.status(403).json({ error: 'No tienes permiso para acceder a este recurso' });
  }
  return next();
};

module.exports = {
  verifyToken,
  checkRole,
  parseCookies,
  getActiveUser
};
