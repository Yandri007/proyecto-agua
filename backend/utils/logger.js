const serializeError = (error) => ({
  name: error?.name,
  message: error?.message,
  code: error?.code,
  stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
});

const write = (level, message, data = {}) => {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data
  };
  if (payload.error instanceof Error) {
    payload.error = serializeError(payload.error);
  }
  const output = JSON.stringify(payload);
  if (level === 'error') {
    console.error(output);
  } else {
    console.log(output);
  }
};

module.exports = {
  info: (message, data) => write('info', message, data),
  warn: (message, data) => write('warn', message, data),
  error: (message, data) => write('error', message, data)
};
