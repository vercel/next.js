/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    explicitParallelRouteChildren: true,
  },
}

module.exports = nextConfig
