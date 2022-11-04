const path = require('path')

module.exports = {
  output: 'standalone',
  experimental: {
    // pnpm virtual-store-dir is outside the app directory
    outputFileTracingRoot: path.resolve(__dirname, '../'),
  },
}
