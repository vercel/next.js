/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    variants: true,
    collapseAdapterRoutes: process.env.COLLAPSE_ADAPTER_ROUTES === '1',
  },
  adapterPath: require.resolve('./my-adapter.mjs'),
}

module.exports = nextConfig
