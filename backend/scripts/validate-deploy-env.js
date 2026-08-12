const path = require('path');
const { parseDatabaseUrl } = require('../utils/databaseConnection');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const value = (name) => String(process.env[name] || '').trim();
const errors = [];
const nodeEnv = value('NODE_ENV') || 'development';
const isProduction = nodeEnv === 'production';
const renderUrl = value('RENDER_EXTERNAL_URL').replace(/\/+$/, '');
const appUrl = (value('APP_URL') || renderUrl).replace(/\/+$/, '');
const allowedOrigins = value('ALLOWED_ORIGINS')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

if (renderUrl && !allowedOrigins.includes(renderUrl)) allowedOrigins.push(renderUrl);

const emailProvider = value('EMAIL_PROVIDER') || 'auto';
const emailProviderValid = ['auto', 'brevo', 'resend', 'off'].includes(emailProvider);
const emailConfigured = Boolean(value('EMAIL_FROM')) && (
  (emailProvider === 'brevo' && Boolean(value('BREVO_API_KEY')))
  || (emailProvider === 'resend' && Boolean(value('RESEND_API_KEY')))
  || (emailProvider === 'auto' && Boolean(value('BREVO_API_KEY') || value('RESEND_API_KEY')))
);

if (value('JWT_SECRET').length < 32) {
  errors.push('JWT_SECRET debe tener al menos 32 caracteres');
}

let databasePassword = value('DB_PASSWORD');
if (value('DATABASE_URL')) {
  try {
    databasePassword = parseDatabaseUrl(value('DATABASE_URL')).password;
  } catch (error) {
    errors.push(error.message);
  }
}

if (!value('DATABASE_URL') && !databasePassword) {
  errors.push('Falta DATABASE_URL o DB_PASSWORD');
}

if (isProduction) {
  if (!value('DATABASE_URL')) {
    errors.push('DATABASE_URL es obligatoria en produccion');
  }
  if (databasePassword.length < 16) {
    errors.push('La contrasena PostgreSQL debe tener al menos 16 caracteres');
  }
  if (value('DB_SSL') !== 'true') {
    errors.push('DB_SSL debe ser "true" en produccion');
  }
  if (!appUrl.startsWith('https://')) {
    errors.push('APP_URL o RENDER_EXTERNAL_URL debe usar HTTPS');
  }
  if (!allowedOrigins.includes(appUrl)) {
    errors.push('El origen publico debe estar autorizado');
  }
  if (value('MONITORING_TOKEN').length < 24) {
    errors.push('MONITORING_TOKEN debe tener al menos 24 caracteres');
  }
  if (!emailProviderValid) {
    errors.push('EMAIL_PROVIDER debe ser auto, brevo, resend u off');
  }
  if (!emailConfigured) {
    errors.push('Configura EMAIL_FROM y la clave del proveedor indicado en EMAIL_PROVIDER');
  }
  if (value('ALLOW_DATABASE_RESTORE') === 'true') {
    errors.push('ALLOW_DATABASE_RESTORE debe permanecer deshabilitado');
  }
}

if (errors.length > 0) {
  console.error('Errores de configuracion:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Configuracion ${isProduction ? 'de despliegue' : 'local'} valida`);
