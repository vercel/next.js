/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: { clientSegmentCache: true },
}

module.exports = nextConfig
