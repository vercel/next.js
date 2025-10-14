/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cacheComponents: true,
    hideLogsAfterAbort: true,
  },
}

module.exports = nextConfig
