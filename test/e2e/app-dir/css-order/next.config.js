/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    mergeCssChunks: false,
  },
  webpack(config) {
    // config.optimization.minimize = false
    // config.output.pathinfo = 'verbose'
    // config.optimization.moduleIds = 'named'
    return config
  },
}

module.exports = nextConfig
