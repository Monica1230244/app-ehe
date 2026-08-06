const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { clientOrigins, jwtSecret } = require('./config');

let io = null;

function init(server) {
  if (io) {
    return io;
  }

  io = new Server(server, { cors: { origin: clientOrigins } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Token manquant'));
    }

    try {
      const payload = jwt.verify(token, jwtSecret);
      socket.user = payload;
      next();
    } catch (error) {
      next(new Error('Token invalide'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.id}`);
    console.log('socket connected', socket.id, socket.user?.email);
    socket.on('disconnect', () => console.log('socket disconnected', socket.id));
  });

  return io;
}

function getIo() {
  return io;
}

module.exports = { init, getIo };
