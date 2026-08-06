const express = require('express');
const { authMiddleware } = require('./auth');
const pool = require('../db');
const { createNotification } = require('../services/notificationService');
const { getIo } = require('../socket');
const router = express.Router();

const validStatuses = ['en_attente', 'en_fabrication', 'prete', 'livree', 'annulee'];
let memoryCommandes = [];
let memoryCommandeId = 1;

async function findCommandeById(id) {
  try {
    const result = await pool.query('SELECT * FROM commandes WHERE id = $1', [id]);
    return result.rows[0] || null;
  } catch (error) {
    return memoryCommandes.find((commande) => commande.id === Number(id)) || null;
  }
}

async function listCommandes(filters = {}) {
  try {
    const clauses = [];
    const values = [];
    let idx = 1;

    if (filters.numero_commande) {
      clauses.push(`numero_commande ILIKE $${idx++}`);
      values.push(`%${filters.numero_commande}%`);
    }
    if (filters.client_id) {
      clauses.push(`client_id = $${idx++}`);
      values.push(filters.client_id);
    }
    if (filters.statut) {
      clauses.push(`statut = $${idx++}`);
      values.push(filters.statut);
    }
    if (filters.date_debut) {
      clauses.push(`date_creation >= $${idx++}`);
      values.push(filters.date_debut);
    }
    if (filters.date_fin) {
      clauses.push(`date_creation <= $${idx++}`);
      values.push(filters.date_fin);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const query = `SELECT * FROM commandes ${where} ORDER BY date_creation DESC LIMIT 200`;
    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    let results = memoryCommandes.slice();
    if (filters.numero_commande) {
      results = results.filter((item) => item.numero_commande.toLowerCase().includes(filters.numero_commande.toLowerCase()));
    }
    if (filters.client_id) {
      results = results.filter((item) => item.client_id === Number(filters.client_id));
    }
    if (filters.statut) {
      results = results.filter((item) => item.statut === filters.statut);
    }
    if (filters.date_debut) {
      results = results.filter((item) => new Date(item.date_creation) >= new Date(filters.date_debut));
    }
    if (filters.date_fin) {
      results = results.filter((item) => new Date(item.date_creation) <= new Date(filters.date_fin));
    }
    return results.sort((a, b) => new Date(b.date_creation) - new Date(a.date_creation));
  }
}

router.use(authMiddleware);

router.post('/', async (req, res) => {
  const {
    client_id,
    cordonnier_id,
    modele,
    pointure,
    couleur,
    matiere,
    semelle,
    quantite,
    date_souhaitee,
    observations
  } = req.body;

  if (!client_id || !modele || !pointure || !couleur || !matiere || !semelle) {
    return res.status(400).json({ error: 'Champs requis manquants.' });
  }

  const numero_commande = `CMD-${String(Date.now()).slice(-8)}`;
  const commandeData = {
    numero_commande,
    client_id,
    revendeur_id: req.user.id,
    cordonnier_id: cordonnier_id || null,
    modele,
    pointure,
    couleur,
    matiere,
    semelle,
    quantite: quantite || 1,
    statut: 'en_attente',
    date_souhaitee: date_souhaitee || null,
    observations: observations || null,
    date_creation: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const result = await pool.query(
      `INSERT INTO commandes (
        numero_commande, client_id, revendeur_id, cordonnier_id,
        modele, pointure, couleur, matiere, semelle, quantite,
        statut, date_souhaitee, observations
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [
        commandeData.numero_commande,
        commandeData.client_id,
        commandeData.revendeur_id,
        commandeData.cordonnier_id,
        commandeData.modele,
        commandeData.pointure,
        commandeData.couleur,
        commandeData.matiere,
        commandeData.semelle,
        commandeData.quantite,
        commandeData.statut,
        commandeData.date_souhaitee,
        commandeData.observations
      ]
    );
    return res.status(201).json({ commande: result.rows[0] });
  } catch (error) {
    console.log(error);
    const commande = { id: memoryCommandeId++, ...commandeData };
    memoryCommandes.push(commande);
    return res.status(201).json({ commande });
  }
});

router.get('/', async (req, res) => {
  try {
    const commandes = await listCommandes(req.query);
    return res.json({ commandes });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de récupérer les commandes.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const commande = await findCommandeById(req.params.id);
    if (!commande) {
      return res.status(404).json({ error: 'Commande non trouvée.' });
    }
    return res.json({ commande });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de récupérer la commande.' });
  }
});

router.patch('/:id/status', async (req, res) => {
  const { statut } = req.body;
  if (!validStatuses.includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }

  try {
    const commande = await findCommandeById(req.params.id);
    if (!commande) {
      return res.status(404).json({ error: 'Commande non trouvée.' });
    }

    commande.statut = statut;
    commande.updated_at = new Date().toISOString();

    try {
      const result = await pool.query(
        `UPDATE commandes SET statut = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [statut, req.params.id]
      );
      const updated = result.rows[0];
      const notificationMessage = `La commande ${updated.numero_commande} est maintenant ${updated.statut.replace('_', ' ')}`;
      await createNotification(req.user.id, notificationMessage, updated.id);
      const io = getIo();
      if (io) {
        io.emit('notification', { notification: { user_id: req.user.id, message: notificationMessage, commande_id: updated.id, created_at: new Date().toISOString() } });
      }
      return res.json({ commande: updated });
    } catch (error) {
      const index = memoryCommandes.findIndex((item) => item.id === commande.id);
      if (index !== -1) {
        memoryCommandes[index] = commande;
      }
      return res.json({ commande });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de mettre à jour le statut.' });
  }
});

module.exports = router;
