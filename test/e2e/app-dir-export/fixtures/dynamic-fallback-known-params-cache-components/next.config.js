/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  cacheComponents: true,
  experimental: {
    outputExportDynamicFallbacks: true,
  },
}

module.exports = nextConfig
