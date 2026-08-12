const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const env = require('../config/env');
const { parseCookies } = require('./auth');

const getActivePlatformAdmin = async (adminId, sessionVersion) => {
  const result = await pool.query(
    `SELECT id, nombre, email, sesion_version, debe_cambiar_password, ultimo_acceso_en
     FROM administradores_plataforma
     WHERE id = $1 AND sesion_version = $2 AND estado = 'activo'`,
    [adminId, sessionVersion]
  );
  return result.rows[0] || null;
};

const verifyPlatformToken = async (req, res, next) => {
  const token = parseCookies(req.headers.cookie)[env.platformSessionCookie];
  if (!token) return res.status(401).json({ error: 'Debes iniciar sesión' });

  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      issuer: 'aquacontrol',
      audience: 'aquacontrol-platform'
    });
    if (payload.kind !== 'platform') {
      return res.status(401).json({ error: 'Sesión inválida' });
    }
    const admin = await getActivePlatformAdmin(payload.id, payload.sv);
    if (!admin) return res.status(401).json({ error: 'La sesión ya no es válida' });
    req.platformAdmin = admin;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
};

const requireCurrentPlatformPassword = (req, res, next) => {
  if (!req.platformAdmin?.debe_cambiar_password) return next();
  if (req.path === '/me' || req.path === '/change-password' || req.path === '/logout') return next();
  return res.status(403).json({
    error: 'Debes cambiar la contraseña temporal para continuar',
    code: 'PASSWORD_CHANGE_REQUIRED'
  });
};

module.exports = {
  verifyPlatformToken,
  requireCurrentPlatformPassword
};
