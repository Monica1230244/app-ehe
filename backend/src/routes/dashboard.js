const express = require('express');
const { authMiddleware } = require('./auth');
const pool = require('../db');
const { useMemoryStore } = require('../config');
const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    if (useMemoryStore) {
      return res.json({ summary: { total: 0, en_attente: 0, en_fabrication: 0, prete: 0, livree: 0 } });
    }
    const values = [];
    let scope = '';
    if (req.user.role === 'cordonnier') {
      values.push(req.user.id);
      scope = 'WHERE cordonnier_id = $1';
    } else if (req.user.role === 'revendeur') {
      values.push(req.user.id);
      scope = 'WHERE revendeur_id = $1';
    }
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE statut = 'en_attente')::INT AS en_attente,
         COUNT(*) FILTER (WHERE statut = 'en_fabrication')::INT AS en_fabrication,
         COUNT(*) FILTER (WHERE statut = 'prete')::INT AS prete,
         COUNT(*) FILTER (WHERE statut = 'livree')::INT AS livree,
         COUNT(*)::INT AS total
       FROM commandes ${scope}`,
      values
    );
    return res.json({ summary: result.rows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de récupérer le tableau de bord.' });
  }
});

module.exports = router;
