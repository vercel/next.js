/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  generateBuildId: async () => 'current-build-id',
}

module.exports = nextConfig
