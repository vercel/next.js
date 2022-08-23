const { join } = require('path')

const { withTurboTracing } = require('../..')

module.exports = withTurboTracing({
  path: join(__dirname, '..', '..', '..', '..', 'target', 'debug'),
})({
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
})
