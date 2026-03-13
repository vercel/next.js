/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    instantNavigationDevToolsToggle: true,
    exposeDevToolsInProductionBuild: true,
  },
}

module.exports = nextConfig
