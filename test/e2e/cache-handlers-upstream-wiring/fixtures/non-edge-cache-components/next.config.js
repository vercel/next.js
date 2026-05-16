/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheHandlers: {
    default: require.resolve('./modern-cache-handler'),
    custom: require.resolve('./modern-cache-handler'),
  },
}

module.exports = nextConfig
