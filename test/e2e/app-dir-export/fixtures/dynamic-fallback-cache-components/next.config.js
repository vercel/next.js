/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  cacheComponents: true,
  experimental: {
    outputExportDynamicFallbacks: true,
    optimisticRouting: true,
  },
}

module.exports = nextConfig
