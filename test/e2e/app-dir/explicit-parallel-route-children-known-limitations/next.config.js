/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    authInterrupts: true,
    explicitParallelRouteChildren: true,
  },
}

module.exports = nextConfig
