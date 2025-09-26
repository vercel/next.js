/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cacheComponents: true,
    prerenderEarlyExit: false,
  },
}

module.exports = nextConfig
