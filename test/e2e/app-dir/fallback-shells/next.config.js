/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: { prerenderEarlyExit: false },
}

module.exports = nextConfig
