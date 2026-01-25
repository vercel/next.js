/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  enablePrerenderSourceMaps: true,
  experimental: {
    cpus: 1,
    serverSourceMaps: true,
  },
}

module.exports = nextConfig
