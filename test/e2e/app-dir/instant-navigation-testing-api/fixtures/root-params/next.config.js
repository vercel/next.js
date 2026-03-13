/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    exposeTestingApiInProductionBuild: true,
    instantNavigationDevToolsToggle: true,
  },
}

module.exports = nextConfig
