/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    useCache: true,
    cacheHandlers: {
      default: 'indirect',
      indirect: 'remote',
      bridge: 'custom',
      custom: require.resolve('./handler.js'),
    },
  },
}

module.exports = nextConfig
