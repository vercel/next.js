/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  adapterPath: require.resolve('./my-adapter.mjs'),
}

module.exports = nextConfig
