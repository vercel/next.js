/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['external-package'],
  },
}

module.exports = nextConfig
