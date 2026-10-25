/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheHandlers: {
    default:
      process.env.CACHE_HANDLER_THROW_ON === 'retry-get'
        ? require.resolve('./retrying-cache-handler.js')
        : require.resolve('./throwing-cache-handler.js'),
  },
}

module.exports = nextConfig
