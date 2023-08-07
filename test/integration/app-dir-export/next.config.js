/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  generateBuildId() {
    return 'test-build-id'
  },
}

module.exports = nextConfig
