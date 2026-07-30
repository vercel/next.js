/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  adapterPath: require.resolve('./my-adapter.mjs'),
  cacheComponents: true,
}

module.exports = nextConfig
