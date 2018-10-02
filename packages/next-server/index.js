const Server = require('./dist/server/next-server').default
module.exports = function (opts) {
  return new Server(opts)
}
