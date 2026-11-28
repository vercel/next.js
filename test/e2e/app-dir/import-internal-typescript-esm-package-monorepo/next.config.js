/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // This is needed to make it work on webpack (next dev)
  // Extracted from issue #41961: https://github.com/vercel/next.js/issues/41961
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    }

    return config
  },
}

module.exports = nextConfig
