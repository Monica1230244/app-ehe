const { app } = require('./app');
const { init } = require('./socket');
const http = require('http');

const server = http.createServer(app);
const io = init(server);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
