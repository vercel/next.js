/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    clientSegmentCache: true,
    dynamicOnHover: true,
  },
}

module.exports = nextConfig
