/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['sidecar-lib', 'side-effectful-lib'],
  },
}

module.exports = nextConfig
