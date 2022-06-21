const path = require('path')

module.exports = {
  experimental: {
    outputStandalone: true,
    // pnpm virtual-store-dir is outside the app directory
    outputFileTracingRoot: path.resolve(__dirname, '../'),
  },
}
