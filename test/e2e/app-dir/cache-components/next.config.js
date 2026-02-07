/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    adapterPath:
      process.env.NEXT_ADAPTER_PATH ?? require.resolve('./my-adapter.mjs'),
  },
}

module.exports = nextConfig
