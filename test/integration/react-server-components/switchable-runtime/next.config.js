const path = require('path')
const withReactChannel = require(path.join(
  __dirname,
  '../../../lib/with-react-channel.js'
))

module.exports = withReactChannel('exp', {
  reactStrictMode: true,
  experimental: {
    serverComponents: true,
    // runtime: 'experimental-edge',
  },
})
