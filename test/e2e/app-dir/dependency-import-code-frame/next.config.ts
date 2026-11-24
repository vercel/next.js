import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  serverExternalPackages: ['external-time'],
}

export default nextConfig
