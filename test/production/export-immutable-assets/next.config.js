/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  deploymentId: 'test-deployment-id',
  experimental: {
    supportsImmutableAssets: true,
  },
}

module.exports = nextConfig
