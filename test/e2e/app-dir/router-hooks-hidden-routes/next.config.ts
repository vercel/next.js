import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Hidden routes (`<Activity mode="hidden">`) are only kept with Cache
  // Components.
  cacheComponents: true,
}

export default nextConfig
