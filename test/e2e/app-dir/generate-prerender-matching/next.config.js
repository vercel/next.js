/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  adapterPath: require.resolve('./my-adapter.mjs'),
  experimental: {
    prerenderMatching: true,
  },
}

module.exports = nextConfig
