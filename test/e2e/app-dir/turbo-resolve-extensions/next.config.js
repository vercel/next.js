/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbo: {
    resolveExtensions: ['png', 'tsx', 'ts', 'jsx', 'js', 'json'],
  },
  webpack(config) {
    config.resolve.extensions = ['.png', '.tsx', '.ts', '.jsx', '.js', '.json']
    return config
  },
}

module.exports = nextConfig
