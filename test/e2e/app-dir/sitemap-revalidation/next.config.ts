import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // This suite exercises route segment revalidate, not Cache Components.
  cacheComponents: false,
}

export default nextConfig
