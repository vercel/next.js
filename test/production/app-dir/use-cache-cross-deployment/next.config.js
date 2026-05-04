/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheHandlers: {
    default: require.resolve('./handler.js'),
  },
  generateBuildId: process.env.BUILD_ID
    ? async () => {
        return process.env.BUILD_ID
      }
    : undefined,
}

module.exports = nextConfig
