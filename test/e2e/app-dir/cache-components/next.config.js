/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    adapterPath: require.resolve('./my-adapter.mjs'),
    authInterrupts: true, // Enable forbidden()/unauthorized() APIs
  },
}

module.exports = nextConfig
