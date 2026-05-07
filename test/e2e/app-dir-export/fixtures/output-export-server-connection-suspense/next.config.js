/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  cacheComponents: true,
  experimental: {
    outputExportDynamicFallbacks: true,
  },
}

module.exports = nextConfig
