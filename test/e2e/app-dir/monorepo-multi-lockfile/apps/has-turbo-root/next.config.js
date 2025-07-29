const { join } = require('path')

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: { root: join(__dirname, '..', '..') },
}

module.exports = nextConfig
