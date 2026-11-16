/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    // Keep Turbopack from re-creating the cache directory while the test runs.
    turbopackFileSystemCacheForDev: false,
  },
}

module.exports = nextConfig
