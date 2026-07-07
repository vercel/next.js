/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  adapterPath:
    process.env.NEXT_ADAPTER_PATH ?? require.resolve('./my-adapter.mjs'),
  experimental: {
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
}

module.exports = nextConfig
