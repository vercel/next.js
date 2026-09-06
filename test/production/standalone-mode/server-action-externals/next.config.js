/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['lodash', 'yocto-queue'],
}

module.exports = nextConfig
