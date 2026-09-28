/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['yocto-queue'],
}

module.exports = nextConfig
