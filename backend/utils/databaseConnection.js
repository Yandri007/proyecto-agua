const decodePart = (value, label) => {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    throw new Error(`${label} contiene una codificacion invalida`);
  }
};

const parseDatabaseUrl = (value) => {
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error('DATABASE_URL no es una URL PostgreSQL valida');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL debe usar el protocolo postgres:// o postgresql://');
  }
  const database = decodePart(parsed.pathname.replace(/^\//, ''), 'El nombre de base');
  if (!parsed.hostname || !parsed.username || !database) {
    throw new Error('DATABASE_URL debe incluir host, usuario y nombre de base');
  }
  return {
    url: value,
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    user: decodePart(parsed.username, 'El usuario de base'),
    password: decodePart(parsed.password, 'La contrasena de base'),
    database
  };
};

const databaseConnectionFromEnv = (source = process.env, { preferDirect = false } = {}) => {
  const selectedUrl = preferDirect
    ? source.DATABASE_DIRECT_URL || source.DATABASE_URL
    : source.DATABASE_URL;
  const parsed = parseDatabaseUrl(selectedUrl);
  if (parsed) return parsed;
  return {
    url: null,
    host: source.DB_HOST || 'localhost',
    port: Number(source.DB_PORT || 5432),
    user: source.DB_USER || 'postgres',
    password: source.DB_PASSWORD || '',
    database: source.DB_NAME || 'aquacontrol'
  };
};

module.exports = {
  parseDatabaseUrl,
  databaseConnectionFromEnv
};
