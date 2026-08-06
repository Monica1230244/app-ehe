const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createServer } = require('node:http');

process.env.NODE_ENV = 'test';

const { app } = require('../src/app');

test('register/login/me flow works', async () => {
  const server = createServer(app);
  server.listen(0);
  await once(server, 'listening');

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nom: 'Test User',
        email: 'test@example.com',
        password: 'secret123',
        role: 'revendeur'
      })
    });

    assert.equal(registerRes.status, 201);
    const registerBody = await registerRes.json();
    assert.equal(registerBody.user.email, 'test@example.com');

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'secret123' })
    });

    assert.equal(loginRes.status, 200);
    const loginBody = await loginRes.json();
    assert.ok(loginBody.token);

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${loginBody.token}` }
    });

    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.user.email, 'test@example.com');
  } finally {
    server.close();
    await once(server, 'close').catch(() => {});
  }
});
