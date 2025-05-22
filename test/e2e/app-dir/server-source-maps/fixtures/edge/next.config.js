/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cpus: 1,
    enablePrerenderSourceMaps: true,
    serverSourceMaps: true,
  },
}

module.exports = nextConfig
