const express = require('express');
const { authMiddleware, requireRoles } = require('./auth');
const pool = require('../db');
const { useMemoryStore } = require('../config');

const router = express.Router();
const memoryClients = [];
let memoryClientId = 1;

function ownsClient(client, user) {
  return user.role === 'admin' || client.revendeur_id === user.id;
}

async function findClientById(id, user) {
  if (useMemoryStore) {
    const client = memoryClients.find((item) => item.id === Number(id));
    return client && ownsClient(client, user) ? client : null;
  }

  const values = [id];
  let ownership = '';
  if (user.role !== 'admin') {
    values.push(user.id);
    ownership = 'AND revendeur_id = $2';
  }
  const result = await pool.query(`SELECT * FROM clients WHERE id = $1 ${ownership}`, values);
  return result.rows[0] || null;
}

async function listClients(search, user) {
  if (useMemoryStore) {
    return memoryClients
      .filter((client) => ownsClient(client, user))
      .filter((client) => {
        const haystack = `${client.nom} ${client.telephone || ''}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
      .sort((first, second) => new Date(second.created_at) - new Date(first.created_at));
  }

  const values = [`%${search}%`];
  let ownership = '';
  if (user.role !== 'admin') {
    values.push(user.id);
    ownership = 'AND revendeur_id = $2';
  }
  const result = await pool.query(
    `SELECT *
     FROM clients
     WHERE (nom ILIKE $1 OR COALESCE(telephone, '') ILIKE $1)
     ${ownership}
     ORDER BY created_at DESC
     LIMIT 200`,
    values
  );
  return result.rows;
}

router.use(authMiddleware, requireRoles('revendeur', 'admin'));

router.post('/', async (req, res) => {
  const { nom, telephone, email, notes } = req.body;
  if (!nom?.trim() || !telephone?.trim()) {
    return res.status(400).json({ error: 'Le nom et le numéro de téléphone sont requis.' });
  }

  try {
    const clientData = {
      nom: nom.trim(),
      telephone: telephone.trim(),
      email: email?.trim() || null,
      notes: notes?.trim() || null,
      revendeur_id: req.user.id
    };

    if (useMemoryStore) {
      const client = {
        id: memoryClientId++,
        ...clientData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryClients.push(client);
      return res.status(201).json({ client });
    }

    const result = await pool.query(
      `INSERT INTO clients (nom, telephone, email, notes, revendeur_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [clientData.nom, clientData.telephone, clientData.email, clientData.notes, clientData.revendeur_id]
    );
    return res.status(201).json({ client: result.rows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de créer le client.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const search = req.query.q?.toString().trim() || '';
    const clients = await listClients(search, req.user);
    return res.json({ clients });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de récupérer les clients.' });
  }
});

router.get('/:id/commandes', async (req, res) => {
  try {
    const client = await findClientById(req.params.id, req.user);
    if (!client) {
      return res.status(404).json({ error: 'Client introuvable.' });
    }

    if (useMemoryStore) {
      return res.json({ commandes: [] });
    }

    const result = await pool.query(
      `SELECT id, numero_commande, modele, statut, date_creation, date_souhaitee
       FROM commandes
       WHERE client_id = $1
       ORDER BY date_creation DESC`,
      [client.id]
    );
    return res.json({ commandes: result.rows });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de récupérer l’historique du client.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const client = await findClientById(req.params.id, req.user);
    if (!client) {
      return res.status(404).json({ error: 'Client introuvable.' });
    }
    return res.json({ client });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de récupérer le client.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const client = await findClientById(req.params.id, req.user);
    if (!client) {
      return res.status(404).json({ error: 'Client introuvable.' });
    }

    const updatedData = {
      nom: typeof req.body.nom === 'string' ? req.body.nom.trim() : client.nom,
      telephone: typeof req.body.telephone === 'string' ? req.body.telephone.trim() : client.telephone,
      email: typeof req.body.email === 'string' ? req.body.email.trim() || null : client.email,
      notes: typeof req.body.notes === 'string' ? req.body.notes.trim() || null : client.notes
    };
    if (!updatedData.nom || !updatedData.telephone) {
      return res.status(400).json({ error: 'Le nom et le numéro de téléphone sont requis.' });
    }

    if (useMemoryStore) {
      Object.assign(client, updatedData, { updated_at: new Date().toISOString() });
      return res.json({ client });
    }

    const result = await pool.query(
      `UPDATE clients
       SET nom = $1, telephone = $2, email = $3, notes = $4
       WHERE id = $5
       RETURNING *`,
      [updatedData.nom, updatedData.telephone, updatedData.email, updatedData.notes, client.id]
    );
    return res.json({ client: result.rows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de mettre à jour le client.' });
  }
});

module.exports = router;
