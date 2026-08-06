const nodeEnv = process.env.NODE_ENV || 'development';
const useMemoryStore = nodeEnv === 'test' || process.env.USE_MEMORY_STORE === 'true';
const jwtSecret = process.env.JWT_SECRET || (nodeEnv === 'production' ? null : 'ehe-local-development-secret');

if (!jwtSecret) {
  throw new Error('JWT_SECRET est requis en production.');
}

const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  return !origin || clientOrigins.includes(origin);
}

module.exports = { clientOrigins, isAllowedOrigin, jwtSecret, useMemoryStore };
