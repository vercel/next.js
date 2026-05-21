/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    exposeTestingApiInProductionBuild: true,
    instantNavigationDevToolsToggle: true,
    prefetchInlining: false,
  },
}

module.exports = nextConfig
