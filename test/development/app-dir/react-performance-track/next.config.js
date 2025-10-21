/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    // Future but produces bad results.
    reactDebugChannel: false,
  },
}

module.exports = nextConfig
