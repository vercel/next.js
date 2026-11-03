/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  adapterPath:
    process.env.NEXT_ADAPTER_PATH ??
    (process.env.NEXT_ENABLE_ADAPTER !== '0'
      ? require.resolve('./my-adapter.mjs')
      : undefined),
  experimental: {
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
}

module.exports = nextConfig
