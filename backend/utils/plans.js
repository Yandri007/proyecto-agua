const PLANS = Object.freeze({
  basico: {
    code: 'basico',
    name: 'Básico',
    price: 29,
    limits: { drivers: 3, monthlyOrders: 500 }
  },
  profesional: {
    code: 'profesional',
    name: 'Profesional',
    price: 59,
    limits: { drivers: 25, monthlyOrders: null }
  }
});

const getPlan = (code) => PLANS[code] || PLANS.basico;

const hasTenantAccess = (tenant) => {
  if (tenant.empresa_suscripcion_estado === 'activa') return true;
  if (tenant.empresa_suscripcion_estado === 'prueba' || tenant.empresa_plan === 'prueba') {
    return new Date(tenant.empresa_prueba_hasta).getTime() > Date.now();
  }
  if (tenant.empresa_suscripcion_estado === 'gracia' && tenant.empresa_periodo_hasta) {
    return new Date(tenant.empresa_periodo_hasta).getTime() > Date.now();
  }
  return false;
};

const requireActiveSubscription = (req, res, next) => {
  if (hasTenantAccess(req.user)) return next();
  return res.status(402).json({
    error: 'La suscripción de la empresa requiere atención',
    code: 'SUBSCRIPTION_REQUIRED'
  });
};

module.exports = {
  PLANS,
  getPlan,
  hasTenantAccess,
  requireActiveSubscription
};
