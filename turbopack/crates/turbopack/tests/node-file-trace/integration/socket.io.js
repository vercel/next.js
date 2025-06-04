const http = require("http");
const io = require("socket.io");
const opts = { port: 0 };
const server = http.createServer((req, res) => {});
server.listen(opts.port);
server.close(() => {
  process.exit(0);
});
