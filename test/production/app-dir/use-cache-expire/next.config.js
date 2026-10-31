/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  cacheHandler: require.resolve('./incremental-cache-handler'),
}

module.exports = nextConfig
