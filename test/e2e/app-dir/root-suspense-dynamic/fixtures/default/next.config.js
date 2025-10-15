/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  enablePrerenderSourceMaps: false,

  experimental: {
    cacheComponents: true,
  },
}

module.exports = nextConfig
