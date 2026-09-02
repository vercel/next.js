/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  adapterPath: require.resolve('./my-adapter.mjs'),
}

module.exports = nextConfig
