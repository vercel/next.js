/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    instrumentationClientRouterTransitionEvents: true,
  },
}

module.exports = nextConfig
