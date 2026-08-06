const express = require('express');
const { authMiddleware } = require('./auth');
const pool = require('../db');
const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE statut = 'en_attente')::INT AS en_attente,
         COUNT(*) FILTER (WHERE statut = 'en_fabrication')::INT AS en_fabrication,
         COUNT(*) FILTER (WHERE statut = 'prete')::INT AS prete,
         COUNT(*) FILTER (WHERE statut = 'livree')::INT AS livree,
         COUNT(*)::INT AS total
       FROM commandes`
    );
    return res.json({ summary: result.rows[0] });
  } catch (error) {
    console.error(error);
    return res.json({ summary: { total: 0, en_attente: 0, en_fabrication: 0, prete: 0, livree: 0 } });
  }
});

module.exports = router;
