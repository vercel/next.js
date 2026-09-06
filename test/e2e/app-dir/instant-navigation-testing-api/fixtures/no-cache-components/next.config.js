/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    exposeTestingApiInProductionBuild: true,
  },
}

module.exports = nextConfig
