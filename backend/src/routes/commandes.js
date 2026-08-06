const express = require('express');
const { authMiddleware, isManager, requireRoles } = require('./auth');
const pool = require('../db');
const { useMemoryStore } = require('../config');
const { createNotification } = require('../services/notificationService');
const { getIo } = require('../socket');

const router = express.Router();
const validStatuses = ['en_attente', 'en_fabrication', 'prete', 'livree', 'annulee'];
const memoryCommandes = [];
const memoryHistory = [];
let memoryCommandeId = 1;
let memoryHistoryId = 1;

function scopeForUser(user, values, column = 'o') {
  if (user.role === 'cordonnier') {
    values.push(user.id);
    return `${column}.cordonnier_id = $${values.length}`;
  }
  if (user.role === 'revendeur') {
    values.push(user.id);
    return `${column}.revendeur_id = $${values.length}`;
  }
  return null;
}

function canChangeStatus(user, commande, statut) {
  if (user.role === 'admin') {
    return true;
  }
  if (user.role === 'cordonnier') {
    return (
      commande.cordonnier_id === user.id &&
      ((commande.statut === 'en_attente' && statut === 'en_fabrication') ||
        (commande.statut === 'en_fabrication' && statut === 'prete'))
    );
  }
  return (
    commande.revendeur_id === user.id &&
    ((commande.statut === 'en_attente' && statut === 'annulee') ||
      (commande.statut === 'prete' && statut === 'livree'))
  );
}

async function findCommandeById(id, user) {
  if (useMemoryStore) {
    const commande = memoryCommandes.find((item) => item.id === Number(id));
    if (!commande) {
      return null;
    }
    if (user.role === 'admin' || commande.revendeur_id === user.id || commande.cordonnier_id === user.id) {
      return commande;
    }
    return null;
  }

  const values = [id];
  const scope = scopeForUser(user, values);
  const clientFields = isManager(user) ? ', c.nom AS client_nom, c.telephone AS client_telephone' : '';
  const join = isManager(user) ? 'LEFT JOIN clients c ON c.id = o.client_id' : '';
  const result = await pool.query(
    `SELECT o.*${clientFields}
     FROM commandes o
     ${join}
     WHERE o.id = $1 ${scope ? `AND ${scope}` : ''}`,
    values
  );
  return result.rows[0] || null;
}

async function listCommandes(filters, user) {
  if (useMemoryStore) {
    return memoryCommandes
      .filter((commande) => user.role === 'admin' || commande.revendeur_id === user.id || commande.cordonnier_id === user.id)
      .filter((commande) => !filters.numero_commande || commande.numero_commande.toLowerCase().includes(filters.numero_commande.toLowerCase()))
      .filter((commande) => !filters.client_id || commande.client_id === Number(filters.client_id))
      .filter((commande) => !filters.statut || commande.statut === filters.statut)
      .filter((commande) => !filters.date_debut || new Date(commande.date_creation) >= new Date(filters.date_debut))
      .filter((commande) => !filters.date_fin || new Date(commande.date_creation) <= new Date(filters.date_fin))
      .sort((first, second) => new Date(second.date_creation) - new Date(first.date_creation));
  }

  const clauses = [];
  const values = [];
  const scope = scopeForUser(user, values);
  if (scope) {
    clauses.push(scope);
  }
  if (filters.numero_commande) {
    values.push(`%${filters.numero_commande}%`);
    clauses.push(`o.numero_commande ILIKE $${values.length}`);
  }
  if (filters.client_id && isManager(user)) {
    values.push(filters.client_id);
    clauses.push(`o.client_id = $${values.length}`);
  }
  if (filters.statut && validStatuses.includes(filters.statut)) {
    values.push(filters.statut);
    clauses.push(`o.statut = $${values.length}`);
  }
  if (filters.date_debut) {
    values.push(filters.date_debut);
    clauses.push(`o.date_creation >= $${values.length}`);
  }
  if (filters.date_fin) {
    values.push(filters.date_fin);
    clauses.push(`o.date_creation < ($${values.length}::date + INTERVAL '1 day')`);
  }

  const clientFields = isManager(user) ? ', c.nom AS client_nom' : '';
  const join = isManager(user) ? 'LEFT JOIN clients c ON c.id = o.client_id' : '';
  const result = await pool.query(
    `SELECT o.*${clientFields}
     FROM commandes o
     ${join}
     ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY o.date_creation DESC
     LIMIT 200`,
    values
  );
  return result.rows;
}

async function validateCreation(clientId, cordonnierId, user) {
  if (useMemoryStore) {
    return true;
  }

  const clientValues = [clientId];
  const ownership = user.role === 'admin' ? '' : `AND revendeur_id = $${clientValues.push(user.id)}`;
  const clientResult = await pool.query(`SELECT id FROM clients WHERE id = $1 ${ownership}`, clientValues);
  if (!clientResult.rows[0]) {
    return false;
  }
  if (!cordonnierId) {
    return true;
  }
  const cordonnierResult = await pool.query(
    `SELECT id FROM users WHERE id = $1 AND role = 'cordonnier' AND is_active = true`,
    [cordonnierId]
  );
  return Boolean(cordonnierResult.rows[0]);
}

router.use(authMiddleware);

router.post('/', requireRoles('revendeur', 'admin'), async (req, res) => {
  const requiredFields = ['client_id', 'modele', 'pointure', 'couleur', 'matiere', 'semelle'];
  if (requiredFields.some((field) => !req.body[field])) {
    return res.status(400).json({ error: 'Les informations de fabrication et le client sont requis.' });
  }

  const clientId = Number(req.body.client_id);
  const cordonnierId = req.body.cordonnier_id ? Number(req.body.cordonnier_id) : null;
  const quantity = Number(req.body.quantite || 1);
  if (
    !Number.isInteger(clientId) ||
    clientId < 1 ||
    (cordonnierId !== null && (!Number.isInteger(cordonnierId) || cordonnierId < 1)) ||
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    return res.status(400).json({ error: 'Client, cordonnier et quantité sont invalides.' });
  }

  try {
    const validReferences = await validateCreation(clientId, cordonnierId, req.user);
    if (!validReferences) {
      return res.status(400).json({ error: 'Le client ou le cordonnier sélectionné est invalide.' });
    }

    const now = new Date().toISOString();
    const commandeData = {
      numero_commande: `CMD-${Date.now()}`,
      client_id: clientId,
      revendeur_id: req.user.id,
      cordonnier_id: cordonnierId,
      modele: req.body.modele.trim(),
      pointure: req.body.pointure.trim(),
      couleur: req.body.couleur.trim(),
      matiere: req.body.matiere.trim(),
      semelle: req.body.semelle.trim(),
      quantite: quantity,
      statut: 'en_attente',
      date_souhaitee: req.body.date_souhaitee || null,
      observations: req.body.observations?.trim() || null,
      date_creation: now,
      created_at: now,
      updated_at: now
    };

    if (useMemoryStore) {
      const commande = { id: memoryCommandeId++, ...commandeData };
      memoryCommandes.push(commande);
      memoryHistory.push({
        id: memoryHistoryId++,
        commande_id: commande.id,
        statut: commande.statut,
        user_id: req.user.id,
        commentaire: 'Commande créée.',
        created_at: now
      });
      return res.status(201).json({ commande });
    }

    const databaseClient = await pool.connect();
    try {
      await databaseClient.query('BEGIN');
      const result = await databaseClient.query(
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
      const commande = result.rows[0];
      await databaseClient.query(
        `INSERT INTO commande_statuts (commande_id, statut, user_id, commentaire)
         VALUES ($1, $2, $3, $4)`,
        [commande.id, commande.statut, req.user.id, 'Commande créée.']
      );
      await databaseClient.query('COMMIT');
      return res.status(201).json({ commande });
    } catch (error) {
      await databaseClient.query('ROLLBACK');
      throw error;
    } finally {
      databaseClient.release();
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de créer la commande.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const commandes = await listCommandes(req.query, req.user);
    return res.json({ commandes });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de récupérer les commandes.' });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const commande = await findCommandeById(req.params.id, req.user);
    if (!commande) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }

    if (useMemoryStore) {
      return res.json({ history: memoryHistory.filter((item) => item.commande_id === commande.id) });
    }

    const result = await pool.query(
      `SELECT statut, commentaire, created_at
       FROM commande_statuts
       WHERE commande_id = $1
       ORDER BY created_at ASC`,
      [commande.id]
    );
    return res.json({ history: result.rows });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de récupérer l’historique.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const commande = await findCommandeById(req.params.id, req.user);
    if (!commande) {
      return res.status(404).json({ error: 'Commande introuvable.' });
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
    const commande = await findCommandeById(req.params.id, req.user);
    if (!commande) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }
    if (commande.statut === statut) {
      return res.status(400).json({ error: 'La commande a déjà ce statut.' });
    }
    if (!canChangeStatus(req.user, commande, statut)) {
      return res.status(403).json({ error: 'Cette transition de statut n’est pas autorisée.' });
    }

    let updated;
    if (useMemoryStore) {
      commande.statut = statut;
      commande.updated_at = new Date().toISOString();
      if (statut === 'en_fabrication') {
        commande.date_debut_fabrication = commande.updated_at;
      }
      if (statut === 'prete' || statut === 'livree') {
        commande.date_fin = commande.updated_at;
      }
      memoryHistory.push({
        id: memoryHistoryId++,
        commande_id: commande.id,
        statut,
        user_id: req.user.id,
        commentaire: req.body.commentaire?.trim() || null,
        created_at: commande.updated_at
      });
      updated = commande;
    } else {
      const databaseClient = await pool.connect();
      try {
        await databaseClient.query('BEGIN');
        const result = await databaseClient.query(
          `UPDATE commandes
           SET statut = $1,
               date_debut_fabrication = CASE WHEN $1 = 'en_fabrication' THEN NOW() ELSE date_debut_fabrication END,
               date_fin = CASE WHEN $1 IN ('prete', 'livree') THEN NOW() ELSE date_fin END
           WHERE id = $2
           RETURNING *`,
          [statut, commande.id]
        );
        updated = result.rows[0];
        await databaseClient.query(
          `INSERT INTO commande_statuts (commande_id, statut, user_id, commentaire)
           VALUES ($1, $2, $3, $4)`,
          [updated.id, statut, req.user.id, req.body.commentaire?.trim() || null]
        );
        await databaseClient.query('COMMIT');
      } catch (error) {
        await databaseClient.query('ROLLBACK');
        throw error;
      } finally {
        databaseClient.release();
      }
    }

    if (statut === 'prete') {
      const message = `La commande ${updated.numero_commande} est prête.`;
      try {
        const notification = await createNotification(updated.revendeur_id, message, updated.id);
        const io = getIo();
        if (io) {
          io.to(`user:${updated.revendeur_id}`).emit('notification', { notification });
        }
      } catch (error) {
        console.error('Notification non envoyée', error);
      }
    }

    return res.json({ commande: updated });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de mettre à jour le statut.' });
  }
});

module.exports = router;
module.exports.findCommandeById = findCommandeById;
