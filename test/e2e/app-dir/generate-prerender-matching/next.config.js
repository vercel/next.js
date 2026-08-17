/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    prerenderMatching: true,
  },
}

module.exports = nextConfig
