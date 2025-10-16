/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // distDir: '.next-custom',
  generateBuildId() {
    return 'test-build-id'
  },
}

module.exports = nextConfig
