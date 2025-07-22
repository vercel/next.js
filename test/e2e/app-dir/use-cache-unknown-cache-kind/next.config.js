/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cacheComponents: true,
    cacheHandlers: {}, // overwrite the default config
    prerenderEarlyExit: false,
  },
}

module.exports = nextConfig
