/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cacheComponents: true,
  },
  serverExternalPackages: ['external-esm-pkg-with-async-import'],
}

module.exports = nextConfig
