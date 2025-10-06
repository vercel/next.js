/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cacheComponents: true,
    clientSegmentCache: true,
    dynamicOnHover: true,
  },
}

module.exports = nextConfig
