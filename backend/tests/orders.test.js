const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createServer } = require('node:http');

process.env.NODE_ENV = 'test';

const { app } = require('../src/app');

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { response, body: await response.json() };
}

test('revendeur, cordonnier et notification suivent le parcours de fabrication', async () => {
  const server = createServer(app);
  server.listen(0);
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = Date.now();

  try {
    const { body: sellerRegistration } = await request(baseUrl, '/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nom: 'Revendeur EHE', email: `revendeur-${suffix}@example.com`, password: 'password123' })
    });
    const sellerToken = sellerRegistration.token;

    const { response: workerCreation } = await request(baseUrl, '/api/auth/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({ nom: 'Cordonnier EHE', email: `cordonnier-${suffix}@example.com`, password: 'password123', role: 'cordonnier' })
    });
    assert.equal(workerCreation.status, 201);

    const { body: workerLogin } = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `cordonnier-${suffix}@example.com`, password: 'password123' })
    });
    const workerToken = workerLogin.token;

    const { body: clientCreation } = await request(baseUrl, '/api/clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({ nom: 'Client EHE', telephone: '90000000' })
    });

    const { body: workerList } = await request(baseUrl, '/api/auth/cordonniers', {
      headers: { Authorization: `Bearer ${sellerToken}` }
    });
    const cordonnier = workerList.cordonniers.find((user) => user.email === `cordonnier-${suffix}@example.com`);

    const { response: commandCreation, body: commandBody } = await request(baseUrl, '/api/commandes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        client_id: clientCreation.client.id,
        cordonnier_id: cordonnier.id,
        modele: 'Mocassin',
        pointure: '40',
        couleur: 'Noir',
        matiere: 'Cuir',
        semelle: 'Caoutchouc',
        quantite: 1
      })
    });
    assert.equal(commandCreation.status, 201);
    const commandId = commandBody.commande.id;

    const start = await request(baseUrl, `/api/commandes/${commandId}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${workerToken}` },
      body: JSON.stringify({ statut: 'en_fabrication' })
    });
    assert.equal(start.response.status, 200);

    const ready = await request(baseUrl, `/api/commandes/${commandId}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${workerToken}` },
      body: JSON.stringify({ statut: 'prete' })
    });
    assert.equal(ready.response.status, 200);

    const notifications = await request(baseUrl, '/api/notifications', {
      headers: { Authorization: `Bearer ${sellerToken}` }
    });
    assert.equal(notifications.body.notifications.length, 1);

    const delivery = await request(baseUrl, `/api/commandes/${commandId}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({ statut: 'livree' })
    });
    assert.equal(delivery.response.status, 200);

    const history = await request(baseUrl, `/api/commandes/${commandId}/history`, {
      headers: { Authorization: `Bearer ${sellerToken}` }
    });
    assert.equal(history.body.history.length, 4);
  } finally {
    server.close();
    await once(server, 'close').catch(() => {});
  }
});
