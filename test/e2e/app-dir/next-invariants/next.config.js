/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  trailingSlash: true,
  experimental: {
    optimisticRouting: true,
  },
  serverExternalPackages: ['invariants-external-package'],
}

module.exports = nextConfig
