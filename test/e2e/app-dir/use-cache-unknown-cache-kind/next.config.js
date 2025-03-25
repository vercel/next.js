/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    cacheHandlers: {}, // overwrite the default config
    prerenderEarlyExit: false,
  },
}

module.exports = nextConfig
