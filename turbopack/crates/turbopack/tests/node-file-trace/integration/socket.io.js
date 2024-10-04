const http = require("http");
const io = require("socket.io");
const opts = { port: 4000 + Math.floor(Math.random() * 1000) };
const server = http.createServer((req, res) => {});
server.listen(opts.port);
server.close(() => {
  process.exit(0);
});
