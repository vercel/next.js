/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      '*.sync-txt': { loaders: ['./sync-loader.js'], as: '*.js' },
    },
  },
}

module.exports = nextConfig
