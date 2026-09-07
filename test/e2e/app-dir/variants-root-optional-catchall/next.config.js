/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    variants: true,
    collapseAdapterRoutes: process.env.COLLAPSE_ADAPTER_ROUTES === '1',
  },
}

if (process.env.BASE_PATH) {
  nextConfig.basePath = process.env.BASE_PATH
}

module.exports = nextConfig
