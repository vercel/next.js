const path = require('path')

module.exports = {
  experimental: {
    serverOnlyDependencies: [
      path.resolve(__dirname, './app/server-only-dep/server-only.js'),
    ],
  },
}
