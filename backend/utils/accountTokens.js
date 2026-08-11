const crypto = require('crypto');

const hashToken = (token) => crypto
  .createHash('sha256')
  .update(String(token))
  .digest('hex');

const createUserToken = async (client, userId, type, ttlMinutes) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);

  await client.query(
    `UPDATE tokens_usuarios
     SET usado_en = CURRENT_TIMESTAMP
     WHERE usuario_id = $1 AND tipo = $2 AND usado_en IS NULL`,
    [userId, type]
  );
  await client.query(
    `INSERT INTO tokens_usuarios
      (usuario_id, tipo, token_hash, expira_en)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP + ($4 * INTERVAL '1 minute'))`,
    [userId, type, tokenHash, ttlMinutes]
  );
  return token;
};

const findValidToken = async (client, token, type) => {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) {
    return null;
  }
  const result = await client.query(
    `SELECT t.id, t.usuario_id, u.email, u.nombre, u.empresa_id
     FROM tokens_usuarios t
     JOIN usuarios u ON u.id = t.usuario_id
     WHERE t.token_hash = $1
       AND t.tipo = $2
       AND t.usado_en IS NULL
       AND t.expira_en > CURRENT_TIMESTAMP
     FOR UPDATE`,
    [hashToken(token), type]
  );
  return result.rows[0] || null;
};

module.exports = {
  createUserToken,
  findValidToken,
  hashToken
};
