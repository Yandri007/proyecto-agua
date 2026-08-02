const env = require('../config/env');
const logger = require('./logger');

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const sendEmail = async ({ to, subject, text, html, idempotencyKey }) => {
  if (!env.email.resendApiKey) {
    logger.warn('transactional_email_skipped', { reason: 'provider_not_configured', to });
    return { delivered: false, provider: 'development' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.email.resendApiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      'User-Agent': 'AquaControl/1.0'
    },
    body: JSON.stringify({
      from: env.email.from,
      to: [to],
      subject,
      text,
      html
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'El proveedor de correo rechazó el mensaje');
  }
  return { delivered: true, provider: 'resend', id: data.id };
};

const sendVerificationEmail = async ({ user, token }) => {
  const verificationUrl = `${env.appUrl}/?verify_token=${encodeURIComponent(token)}`;
  const safeName = escapeHtml(user.nombre);
  const result = await sendEmail({
    to: user.email,
    subject: 'Verifica tu correo en AquaControl',
    text: `Hola ${user.nombre}. Verifica tu correo abriendo este enlace: ${verificationUrl}`,
    html: `<p>Hola ${safeName},</p><p>Verifica tu correo para activar tu cuenta de AquaControl.</p><p><a href="${verificationUrl}">Verificar correo</a></p><p>El enlace vence en 24 horas.</p>`,
    idempotencyKey: `verify-email-${user.id}-${token.slice(0, 12)}`
  });
  return { ...result, developmentUrl: env.nodeEnv === 'development' ? verificationUrl : undefined };
};

const sendPasswordResetEmail = async ({ user, token }) => {
  const resetUrl = `${env.appUrl}/?reset_token=${encodeURIComponent(token)}`;
  const safeName = escapeHtml(user.nombre);
  const result = await sendEmail({
    to: user.email,
    subject: 'Restablece tu contraseña de AquaControl',
    text: `Hola ${user.nombre}. Restablece tu contraseña abriendo este enlace: ${resetUrl}`,
    html: `<p>Hola ${safeName},</p><p>Recibimos una solicitud para cambiar tu contraseña.</p><p><a href="${resetUrl}">Restablecer contraseña</a></p><p>El enlace vence en 30 minutos. Si no hiciste esta solicitud, ignora el mensaje.</p>`,
    idempotencyKey: `reset-password-${user.id}-${token.slice(0, 12)}`
  });
  return { ...result, developmentUrl: env.nodeEnv === 'development' ? resetUrl : undefined };
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail
};
