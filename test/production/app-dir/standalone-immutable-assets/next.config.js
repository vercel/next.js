/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'standalone',
  deploymentId: 'test-deployment-id',
  adapterPath: require.resolve('./my-adapter.mjs'),
}

module.exports = nextConfig
