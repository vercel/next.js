/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    adapterPath: require.resolve('./my-adapter.mjs'),
  },
}

module.exports = nextConfig
