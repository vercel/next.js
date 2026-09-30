/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheHandler: require.resolve('./cache-handler.js'),
}

module.exports = nextConfig
