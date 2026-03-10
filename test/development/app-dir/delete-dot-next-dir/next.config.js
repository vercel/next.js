/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
}

module.exports = nextConfig
