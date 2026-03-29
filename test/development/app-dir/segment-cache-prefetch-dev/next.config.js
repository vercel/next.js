/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    turbopackPrefetchInDev: true,
  },
}

module.exports = nextConfig
