/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheHandlers: {
    default: require.resolve('./default-handler'),
    custom: require.resolve('./custom-handler'),
  },
}

module.exports = nextConfig
