/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheHandlers: {}, // overwrite the default config
  experimental: {
    prerenderEarlyExit: false,
  },
}

module.exports = nextConfig
