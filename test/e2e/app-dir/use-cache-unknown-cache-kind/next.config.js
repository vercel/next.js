/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    cacheHandlers: {}, // overwrite the default config
    prerenderEarlyExit: false,
  },
}

module.exports = nextConfig
