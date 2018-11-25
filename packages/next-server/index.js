// This file is used for when users run `require('next-server')`
const Server = require('./dist/server/next-server').default
module.exports = function (options) {
  return new Server(options)
}
