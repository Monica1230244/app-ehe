require('./loadEnv');

const express = require('express');
const cors = require('cors');
const path = require('path');
const authRouter = require('./routes/auth');
const { isAllowedOrigin, useMemoryStore } = require('./config');
const pool = require('./db');

const app = express();

app.set('trust proxy', 1);
app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origine non autorisée.'));
    }
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => res.json({ ok: true, service: 'EHE ERP backend' }));
app.get('/health', async (req, res) => {
  try {
    if (!useMemoryStore) {
      await pool.query('SELECT 1');
    }
    return res.json({ ok: true, database: useMemoryStore ? 'memory' : 'postgresql' });
  } catch (error) {
    return res.status(503).json({ ok: false, database: 'unavailable' });
  }
});
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/api/auth', authRouter);
app.use('/api/clients', require('./routes/clients'));
app.use('/api/commandes', require('./routes/commandes'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/dashboard', require('./routes/dashboard'));

module.exports = { app };
