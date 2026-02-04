/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    // Enable the testing API in production builds for these tests
    exposeTestingApiInProductionBuild: true,
  },
}

module.exports = nextConfig
