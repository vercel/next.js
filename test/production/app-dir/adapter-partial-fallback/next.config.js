/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  basePath: '/docs',
  cacheComponents: true,
  partialPrefetching: true,
  adapterPath: require.resolve('./my-adapter.mjs'),
}

module.exports = nextConfig
