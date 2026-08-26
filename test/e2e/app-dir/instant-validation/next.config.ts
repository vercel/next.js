import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    // Needed for the forbidden()/unauthorized() navigation-signal fixtures.
    authInterrupts: true,
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
  productionBrowserSourceMaps: true,
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
