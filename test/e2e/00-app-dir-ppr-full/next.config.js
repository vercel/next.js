/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    ppr: true,
    pprFallbacks: true,
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  productionBrowserSourceMaps: true,
}

module.exports = nextConfig
