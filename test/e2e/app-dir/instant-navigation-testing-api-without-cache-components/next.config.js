/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    // Enable the testing API in production builds for these tests
    exposeTestingApiInProductionBuild: true,
  },
}

module.exports = nextConfig
