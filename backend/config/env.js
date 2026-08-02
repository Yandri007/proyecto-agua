const path = require('path');
const { databaseConnectionFromEnv } = require('../utils/databaseConnection');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }
  return value;
};

const jwtSecret = required('JWT_SECRET');
const nodeEnv = process.env.NODE_ENV || 'development';
const port = Number(process.env.PORT || 3000);

if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
}

const renderUrl = (process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const appUrl = (process.env.APP_URL || renderUrl || `http://localhost:${port}`).replace(/\/+$/, '');
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (renderUrl && !allowedOrigins.includes(renderUrl)) allowedOrigins.push(renderUrl);

const database = databaseConnectionFromEnv(process.env);
const databaseSsl = process.env.DB_SSL === 'true';
if (!database.password) {
  throw new Error('Falta DATABASE_URL o DB_PASSWORD para conectar PostgreSQL');
}

if (nodeEnv === 'production') {
  if (!appUrl.startsWith('https://')) {
    throw new Error('APP_URL debe usar HTTPS en producción');
  }
  if (allowedOrigins.length === 0) {
    throw new Error('ALLOWED_ORIGINS es obligatorio en producción');
  }
  if (!databaseSsl) {
    throw new Error('DB_SSL=true es obligatorio en produccion');
  }
}

module.exports = {
  nodeEnv,
  port,
  appUrl,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  sessionCookie: 'aquacontrol_session',
  defaultEmpresaName: process.env.DEFAULT_EMPRESA_NAME || 'AquaControl Demo',
  defaultEmpresaSlug: process.env.DEFAULT_EMPRESA_SLUG || 'aqua-demo',
  allowedOrigins,
  trustProxy: Number(process.env.TRUST_PROXY || 1),
  locationRetentionDays: Number(process.env.LOCATION_RETENTION_DAYS || 30),
  auditRetentionDays: Number(process.env.AUDIT_RETENTION_DAYS || 365),
  monitoringToken: process.env.MONITORING_TOKEN || '',
  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    from: process.env.EMAIL_FROM || 'AquaControl <onboarding@resend.dev>'
  },
  kushki: {
    environment: process.env.KUSHKI_ENVIRONMENT === 'production' ? 'production' : 'uat',
    publicMerchantId: process.env.KUSHKI_PUBLIC_MERCHANT_ID || '',
    privateMerchantId: process.env.KUSHKI_PRIVATE_MERCHANT_ID || '',
    webhookSignature: process.env.KUSHKI_WEBHOOK_SIGNATURE || ''
  },
  db: {
    ...(database.url ? { connectionString: database.url } : {
      user: database.user,
      host: database.host,
      database: database.database,
      password: database.password,
      port: database.port
    }),
    ssl: databaseSsl ? { rejectUnauthorized: false } : false,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 10000),
    application_name: 'aquacontrol'
  },
  databaseDirectUrl: process.env.DATABASE_DIRECT_URL || ''
};
