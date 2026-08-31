/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  deploymentId: 'test-deployment-id',
  adapterPath: require.resolve('./my-adapter.mjs'),
}

module.exports = nextConfig
