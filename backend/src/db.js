const { Pool } = require('pg');
const { useMemoryStore } = require('./config');

const pool = useMemoryStore
  ? null
  : new Pool({
      connectionString: process.env.DATABASE_URL
    });

if (!useMemoryStore && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL est requis. Configurez backend/.env avant de démarrer l’API.');
}

module.exports = pool;
