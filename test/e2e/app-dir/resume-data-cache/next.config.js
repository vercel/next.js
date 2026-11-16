/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheHandlers: {
    handoff: require.resolve('./handoff-handler.js'),
  },
}

module.exports = nextConfig
