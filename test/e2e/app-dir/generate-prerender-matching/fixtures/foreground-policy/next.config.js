/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    paramMatching: true,
  },
}

module.exports = nextConfig
