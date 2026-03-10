/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbopackFilesystemCacheInDev: true,
  },
}

module.exports = nextConfig
