import Server from './'

// This file is used for when users run `require('next')`
module.exports = (opts) => {
  return new Server(opts)
}
