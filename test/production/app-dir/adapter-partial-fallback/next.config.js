/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  basePath: '/docs',
  cacheComponents: true,
  adapterPath: require.resolve('./my-adapter.mjs'),
}

module.exports = nextConfig
