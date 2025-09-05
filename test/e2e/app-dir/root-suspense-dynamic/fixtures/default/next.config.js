/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cacheComponents: true,
    enablePrerenderSourceMaps: false,
  },
}

module.exports = nextConfig
