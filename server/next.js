// This file is used for when users run `require('next')`
module.exports = (opts) => {
  const Server = opts.dev ? require('./next-dev-server').default : require('./next-server').default
  return new Server(opts)
}
