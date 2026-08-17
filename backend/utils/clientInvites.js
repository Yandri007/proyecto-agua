const jwt = require('jsonwebtoken');
const env = require('../config/env');

const CLIENT_INVITE_AUDIENCE = 'aquacontrol-client-registration';

const createClientInvite = (company) => jwt.sign(
  {
    kind: 'client_registration',
    companyId: Number(company.id),
    version: Number(company.registro_clientes_version)
  },
  env.jwtSecret,
  {
    expiresIn: '365d',
    issuer: 'aquacontrol',
    audience: CLIENT_INVITE_AUDIENCE
  }
);

const verifyClientInvite = (token, company) => {
  if (typeof token !== 'string' || token.length < 20 || token.length > 1000) return false;
  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      issuer: 'aquacontrol',
      audience: CLIENT_INVITE_AUDIENCE
    });
    return payload.kind === 'client_registration'
      && Number(payload.companyId) === Number(company.id)
      && Number(payload.version) === Number(company.registro_clientes_version);
  } catch (error) {
    return false;
  }
};

const buildClientPortalUrl = (company) => {
  const token = createClientInvite(company);
  const params = new URLSearchParams({
    cliente_empresa: company.slug,
    invite: token
  });
  return `${env.appUrl}/?${params.toString()}`;
};

module.exports = {
  buildClientPortalUrl,
  createClientInvite,
  verifyClientInvite
};
