/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      '*.jsonlike2': {
        loaders: ['test-identity-loader'],
        as: '*.json',
      },
    },
  },
}

module.exports = nextConfig
