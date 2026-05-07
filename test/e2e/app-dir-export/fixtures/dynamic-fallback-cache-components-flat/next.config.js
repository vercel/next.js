/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: false,
  cacheComponents: true,
  experimental: {
    outputExportDynamicFallbacks: true,
  },
}

module.exports = nextConfig
