const path = require('path')
const withReactChannel = require(path.join(
  __dirname,
  '../../../lib/with-react-channel.js'
))

module.exports = withReactChannel('exp', {
  reactStrictMode: true,
  onDemandEntries: {
    maxInactiveAge: 1000 * 60 * 60,
  },
  pageExtensions: ['js', 'ts', 'jsx'], // .tsx won't be treat as page,
  experimental: {
    appDir: true,
    runtime: 'nodejs',
    serverComponents: true,
  },
})
