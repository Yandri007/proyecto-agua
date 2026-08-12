const path = require('path');
const { parseDatabaseUrl } = require('../utils/databaseConnection');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const value = (name) => String(process.env[name] || '').trim();
const failures = [];
const checks = [];
const stagingMode = process.argv.includes('--staging');

const check = (condition, label, remediation) => {
  checks.push({ condition, label });
  if (!condition) failures.push({ label, remediation });
};

const renderUrl = value('RENDER_EXTERNAL_URL').replace(/\/+$/, '');
const appUrl = (value('APP_URL') || renderUrl).replace(/\/+$/, '');
const allowedOrigins = value('ALLOWED_ORIGINS')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);
if (renderUrl && !allowedOrigins.includes(renderUrl)) allowedOrigins.push(renderUrl);

const emailFrom = value('EMAIL_FROM').toLowerCase();
const emailProvider = value('EMAIL_PROVIDER') || 'auto';
const emailProviderValid = ['auto', 'brevo', 'resend'].includes(emailProvider);
const emailCredentialsPresent = (
  (emailProvider === 'brevo' && Boolean(value('BREVO_API_KEY')))
  || (emailProvider === 'resend' && Boolean(value('RESEND_API_KEY')))
  || (emailProvider === 'auto' && Boolean(value('BREVO_API_KEY') || value('RESEND_API_KEY')))
);
const databaseUrl = value('DATABASE_URL');
let databaseUrlValid = true;
let databasePassword = value('DB_PASSWORD');
if (databaseUrl) {
  try {
    databasePassword = parseDatabaseUrl(databaseUrl).password;
  } catch (error) {
    databaseUrlValid = false;
  }
}

check(value('NODE_ENV') === 'production', 'NODE_ENV de produccion', 'Configura NODE_ENV=production.');
check(appUrl.startsWith('https://'), 'URL publica con HTTPS', 'Configura APP_URL con el dominio HTTPS definitivo.');
check(Boolean(appUrl) && allowedOrigins.includes(appUrl), 'Origen publico autorizado', 'Incluye APP_URL en ALLOWED_ORIGINS.');
check(databaseUrlValid && Boolean(databaseUrl || value('DB_HOST')), 'Conexion PostgreSQL valida', 'Configura DATABASE_URL con la conexion de Supabase.');
check(value('DB_SSL') === 'true', 'PostgreSQL con SSL', 'Configura DB_SSL=true para la base administrada.');
check(databasePassword.length >= 16 && databasePassword !== 'cambia-esta-clave', 'Contrasena de base robusta', 'Usa una contrasena unica de al menos 16 caracteres.');
check(value('JWT_SECRET').length >= 32 && !value('JWT_SECRET').includes('genera-un-secreto'), 'Secreto JWT real', 'Genera un JWT_SECRET aleatorio de al menos 32 caracteres.');
check(value('MONITORING_TOKEN').length >= 24, 'Token de monitoreo', 'Genera MONITORING_TOKEN con al menos 24 caracteres.');
const bootstrapEmail = value('PLATFORM_ADMIN_EMAIL');
const bootstrapPassword = value('PLATFORM_ADMIN_PASSWORD');
check(
  (!bootstrapEmail && !bootstrapPassword) || (Boolean(bootstrapEmail) && bootstrapPassword.length >= 14),
  'Bootstrap de propietario seguro',
  'Configura ambas variables PLATFORM_ADMIN_* durante el alta inicial o retira ambas despues de cambiar la contrasena.'
);
check(emailProviderValid && emailCredentialsPresent && emailFrom && (stagingMode || !emailFrom.includes('resend.dev')), 'Correo transaccional', 'Configura Brevo o Resend y usa un remitente con dominio propio para la salida comercial.');
if (!stagingMode) {
  check(value('KUSHKI_ENVIRONMENT') === 'production', 'Kushki en produccion', 'Configura KUSHKI_ENVIRONMENT=production tras la certificacion.');
  check(Boolean(value('KUSHKI_PUBLIC_MERCHANT_ID')) && Boolean(value('KUSHKI_PRIVATE_MERCHANT_ID')) && value('KUSHKI_WEBHOOK_SIGNATURE').length >= 16, 'Credenciales y firma de Kushki', 'Configura los identificadores de comercio y la firma del webhook.');
}
check(value('ALLOW_DATABASE_RESTORE') !== 'true', 'Restauracion remota deshabilitada', 'Manten ALLOW_DATABASE_RESTORE=false en produccion.');

for (const item of checks) {
  console.log(`${item.condition ? 'OK' : 'FALTA'}  ${item.label}`);
}

if (failures.length > 0) {
  console.error(`\nPrepublicacion bloqueada: ${failures.length} requisito(s) pendiente(s).`);
  for (const failure of failures) console.error(`- ${failure.remediation}`);
  process.exitCode = 1;
} else {
  console.log(`\nPrepublicacion ${stagingMode ? 'de staging' : 'comercial'} aprobada. Ejecuta pruebas, backup y despliegue.`);
}
