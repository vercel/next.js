/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  adapterPath: require.resolve('./my-adapter.mjs'),
  experimental: {
    paramMatching: true,
  },
}

module.exports = nextConfig
