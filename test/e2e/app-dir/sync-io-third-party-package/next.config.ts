import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Not bundled, so its frames point at node_modules even without source maps.
  serverExternalPackages: ['external-random'],
}

export default nextConfig
