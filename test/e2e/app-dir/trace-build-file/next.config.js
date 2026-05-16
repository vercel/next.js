/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbopackFileSystemCacheForBuild: true,
  },
}

module.exports = nextConfig
