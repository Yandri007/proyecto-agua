const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const env = require('../config/env');
const { verifyToken, checkRole } = require('../middleware/auth');
const { PLANS } = require('../utils/plans');
const { writeAudit } = require('../utils/audit');
const logger = require('../utils/logger');

const router = express.Router();
const kushkiBaseUrl = env.kushki.environment === 'production'
  ? 'https://api.kushkipagos.com'
  : 'https://api-uat.kushkipagos.com';

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false
});

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  return next();
};

const kushkiRequest = async (path, options = {}) => {
  if (!env.kushki.privateMerchantId) {
    const error = new Error('Kushki todavía no está configurado');
    error.status = 503;
    throw error;
  }
  const response = await fetch(`${kushkiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Private-Merchant-Id': env.kushki.privateMerchantId,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || 'Kushki rechazó la operación');
    error.status = response.status >= 500 ? 502 : 400;
    error.providerCode = data.code;
    throw error;
  }
  return data;
};

const isValidKushkiWebhook = ({
  body,
  signature,
  timestamp,
  merchantId,
  expectedMerchantId,
  webhookSecret,
  now = Date.now()
}) => {
  if (!webhookSecret || !signature || !timestamp) return false;
  if (expectedMerchantId && merchantId !== expectedMerchantId) return false;

  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp)) return false;
  const timestampMs = numericTimestamp > 1e12 ? numericTimestamp : numericTimestamp * 1000;
  // Kushki retries notifications for several hours. Idempotency still prevents
  // a valid notification from being applied more than once.
  if (Math.abs(now - timestampMs) > 4 * 60 * 60 * 1000) return false;

  const payload = `${JSON.stringify(body)}.${timestamp}`;
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
};

const verifyWebhook = (req) => isValidKushkiWebhook({
  body: req.body,
  signature: req.get('x-kushki-signature'),
  timestamp: req.get('x-kushki-id'),
  merchantId: req.get('x-kushki-key'),
  expectedMerchantId: env.kushki.publicMerchantId,
  webhookSecret: env.kushki.webhookSignature
});

const createSubscriptionForTenant = async (req, planCode, paymentToken) => {
  const plan = PLANS[planCode];
  const nameParts = req.user.nombre.trim().split(/\s+/);
  const firstName = nameParts.shift();
  const lastName = nameParts.join(' ') || 'Administrador';
  const startDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const providerResponse = await kushkiRequest('/subscriptions/v1/card', {
    method: 'POST',
    body: JSON.stringify({
      token: paymentToken,
      amount: {
        subtotalIva: 0,
        subtotalIva0: plan.price,
        ice: 0,
        iva: 0,
        currency: 'USD'
      },
      planName: `AquaControl ${plan.name}`,
      periodicity: 'monthly',
      contactDetails: {
        firstName,
        lastName,
        email: req.user.email
      },
      startDate,
      metadata: {
        empresaId: String(req.user.empresa_id),
        plan: plan.code
      }
    })
  });
  const subscriptionId = providerResponse.subscriptionId
    || providerResponse.subscription_id
    || providerResponse.id;
  if (!subscriptionId) {
    throw new Error('Kushki no devolvió un identificador de suscripción');
  }

  await pool.query(
    `UPDATE empresas
     SET plan = $1,
         suscripcion_estado = 'pendiente',
         proveedor_pago = 'kushki',
         suscripcion_externa_id = $2
     WHERE id = $3`,
    [plan.code, String(subscriptionId), req.user.empresa_id]
  );
  await writeAudit({
    req,
    action: 'suscripcion.creada',
    entity: 'empresas',
    entityId: req.user.empresa_id,
    details: { provider: 'kushki', plan: plan.code }
  });
  return String(subscriptionId);
};

router.get('/config', verifyToken, checkRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT plan, suscripcion_estado, prueba_hasta, periodo_hasta,
              proveedor_pago, suscripcion_externa_id
       FROM empresas
       WHERE id = $1`,
      [req.user.empresa_id]
    );
    return res.json({
      provider: 'kushki',
      configured: Boolean(
        env.kushki.publicMerchantId
        && env.kushki.privateMerchantId
        && env.kushki.webhookSignature
      ),
      environment: env.kushki.environment,
      publicMerchantId: env.kushki.publicMerchantId || null,
      plans: Object.values(PLANS).map((plan) => ({
        code: plan.code,
        name: plan.name,
        price: plan.price,
        limits: plan.limits
      })),
      subscription: result.rows[0]
    });
  } catch (error) {
    return res.status(500).json({ error: 'No fue posible cargar la suscripción' });
  }
});

router.post(
  '/subscription',
  verifyToken,
  checkRole(['admin']),
  body('plan').isIn(Object.keys(PLANS)).withMessage('Plan inválido'),
  body('token').isString().isLength({ min: 10, max: 300 }).withMessage('Token de pago inválido'),
  handleValidation,
  async (req, res) => {
    try {
      const subscriptionId = await createSubscriptionForTenant(
        req,
        req.body.plan,
        req.body.token
      );
      return res.status(201).json({
        message: 'Método de pago registrado. La suscripción está pendiente de confirmación.',
        subscription_id: String(subscriptionId),
        status: 'pendiente'
      });
    } catch (error) {
      logger.error('subscription_creation_failed', {
        error,
        companyId: req.user.empresa_id,
        providerCode: error.providerCode
      });
      return res.status(error.status || 500).json({
        error: error.message || 'No fue posible crear la suscripción'
      });
    }
  }
);

router.post(
  '/subscription/kajita',
  verifyToken,
  checkRole(['admin']),
  async (req, res) => {
    const planCode = req.query.plan;
    const paymentToken = req.body.token;
    if (!Object.hasOwn(PLANS, planCode) || typeof paymentToken !== 'string') {
      return res.redirect('/admin/?billing=invalid');
    }
    try {
      await createSubscriptionForTenant(req, planCode, paymentToken);
      return res.redirect('/admin/?billing=success');
    } catch (error) {
      logger.error('kajita_subscription_failed', { error, companyId: req.user.empresa_id });
      return res.redirect('/admin/?billing=error');
    }
  }
);

router.delete('/subscription', verifyToken, checkRole(['admin']), async (req, res) => {
  try {
    const companyResult = await pool.query(
      `SELECT suscripcion_externa_id
       FROM empresas
       WHERE id = $1 AND proveedor_pago = 'kushki'`,
      [req.user.empresa_id]
    );
    const subscriptionId = companyResult.rows[0]?.suscripcion_externa_id;
    if (!subscriptionId) {
      return res.status(404).json({ error: 'No existe una suscripción activa' });
    }
    await kushkiRequest(`/subscriptions/v1/card/${encodeURIComponent(subscriptionId)}`, {
      method: 'DELETE'
    });
    await pool.query(
      `UPDATE empresas
       SET suscripcion_estado = 'cancelada'
       WHERE id = $1`,
      [req.user.empresa_id]
    );
    return res.json({ message: 'Suscripción cancelada' });
  } catch (error) {
    logger.error('subscription_cancellation_failed', { error });
    return res.status(error.status || 500).json({
      error: error.message || 'No fue posible cancelar la suscripción'
    });
  }
});

router.post('/webhook/kushki', webhookLimiter, async (req, res) => {
  if (!verifyWebhook(req)) {
    return res.status(401).json({ error: 'Firma de webhook inválida' });
  }

  const event = req.body?.event || {};
  const eventType = req.body?.name || 'unknown';
  const companyId = Number(event.metadata?.empresaId);
  const externalEventId = String(
    event.id
    || `${eventType}-${event.subscriptionId || 'unknown'}-${event.created || req.get('x-kushki-id')}`
  );
  if (!Number.isInteger(companyId) || companyId <= 0) {
    return res.status(400).json({ error: 'Empresa no identificada' });
  }

  const planCode = Object.hasOwn(PLANS, event.metadata?.plan)
    ? event.metadata.plan
    : null;
  const amount = event.amount
    ? Number(event.amount.subtotalIva || 0)
      + Number(event.amount.subtotalIva0 || 0)
      + Number(event.amount.iva || 0)
      + Number(event.amount.ice || 0)
    : null;
  const stateByEvent = {
    subscriptionApproved: 'pendiente',
    approvedTransaction: 'pendiente',
    succesfullCharge: 'activa',
    failedRetry: 'gracia',
    declinedCharge: 'gracia',
    lastRetry: 'vencida',
    subscriptionDelete: 'cancelada'
  };
  const subscriptionState = stateByEvent[eventType] || 'pendiente';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO eventos_suscripcion
        (proveedor, evento_externo_id, empresa_id, tipo, monto,
         moneda, estado, detalles)
       VALUES ('kushki', $1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (proveedor, evento_externo_id) DO NOTHING
       RETURNING id`,
      [
        externalEventId,
        companyId,
        eventType,
        Number.isFinite(amount) ? amount : null,
        event.amount?.currency || null,
        subscriptionState,
        JSON.stringify({
          subscriptionId: event.subscriptionId,
          plan: planCode,
          created: event.created,
          paymentBrand: event.paymentBrand,
          code: event.code
        })
      ]
    );
    if (inserted.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.json({ received: true, duplicate: true });
    }

    const periodExpression = subscriptionState === 'activa'
      ? "CURRENT_TIMESTAMP + INTERVAL '35 days'"
      : subscriptionState === 'gracia'
        ? "CURRENT_TIMESTAMP + INTERVAL '7 days'"
        : 'periodo_hasta';
    await client.query(
      `UPDATE empresas
       SET suscripcion_estado = $1,
           plan = COALESCE($2, plan),
           proveedor_pago = 'kushki',
           suscripcion_externa_id = COALESCE($3, suscripcion_externa_id),
           periodo_hasta = ${periodExpression}
       WHERE id = $4`,
      [subscriptionState, planCode, event.subscriptionId ? String(event.subscriptionId) : null, companyId]
    );
    await client.query('COMMIT');
    return res.json({ received: true });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('kushki_webhook_failed', { error, externalEventId, companyId });
    return res.status(500).json({ error: 'No fue posible procesar el evento' });
  } finally {
    client.release();
  }
});

module.exports = router;
module.exports.verifyWebhook = verifyWebhook;
module.exports.isValidKushkiWebhook = isValidKushkiWebhook;
