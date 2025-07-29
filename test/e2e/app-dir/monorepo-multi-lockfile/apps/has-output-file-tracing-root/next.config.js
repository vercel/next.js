const { join } = require('path')

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  outputFileTracingRoot: join(__dirname, '..', '..'),
}

module.exports = nextConfig
