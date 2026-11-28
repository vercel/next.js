/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {}

nextConfig.experimental = {
  optimizePackageImports: ['@/ui'],
}

module.exports = nextConfig
