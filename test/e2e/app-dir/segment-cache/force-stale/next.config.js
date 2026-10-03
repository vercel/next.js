/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // cacheComponents is left unset so this suite runs both with and without
  // Cache Components.
  productionBrowserSourceMaps: true,
  experimental: {
    prefetchInlining: false,
  },
}

module.exports = nextConfig
