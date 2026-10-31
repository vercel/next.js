/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheHandler: require.resolve('./incremental-cache-handler'),
}

module.exports = nextConfig
