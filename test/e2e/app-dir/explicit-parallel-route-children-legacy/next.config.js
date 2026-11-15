/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    // This is a temporary escape hatch for applications that need the old
    // implicit children behavior while explicit detection rolls out.
    explicitParallelRouteChildren: false,
  },
}

module.exports = nextConfig
