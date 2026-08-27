const path = require('node:path')

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      'probe.js': {
        loaders: [path.resolve(__dirname, './lazy-rebuild-loader.js')],
      },
    },
  },
}

module.exports = nextConfig
