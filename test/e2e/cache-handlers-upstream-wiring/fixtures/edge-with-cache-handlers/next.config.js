/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: false,
  cacheHandlers: {
    default: require.resolve('./default-handler'),
    custom: require.resolve('./custom-handler'),
  },
}

module.exports = nextConfig
