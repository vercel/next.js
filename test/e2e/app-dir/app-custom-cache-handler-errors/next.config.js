/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheHandlers: {
    default:
      process.env.CACHE_HANDLER_THROW_ON === 'retry-get'
        ? require.resolve('./retrying-cache-handler.js')
        : process.env.CACHE_HANDLER_THROW_ON === 'shared-write-failure'
          ? require.resolve('./shared-write-failure-handler.js')
          : require.resolve('./throwing-cache-handler.js'),
  },
}

module.exports = nextConfig
