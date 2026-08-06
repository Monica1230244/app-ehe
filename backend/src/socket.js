const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
let io = null;

function init(server) {
  if (io) {
    return io;
  }

  io = new Server(server, { cors: { origin: '*' } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Token manquant'));
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      socket.user = payload;
      next();
    } catch (error) {
      next(new Error('Token invalide'));
    }
  });

  io.on('connection', (socket) => {
    console.log('socket connected', socket.id, socket.user?.email);
    socket.on('disconnect', () => console.log('socket disconnected', socket.id));
  });

  return io;
}

function getIo() {
  return io;
}

module.exports = { init, getIo };
