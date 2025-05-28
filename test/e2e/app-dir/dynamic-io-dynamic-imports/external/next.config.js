/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
  },
  serverExternalPackages: ['external-esm-pkg-with-async-import'],
}

module.exports = nextConfig
