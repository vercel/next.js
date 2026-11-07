import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The `dynamic` route segment config is not available with Cache Components.
  cacheComponents: false,
}

export default nextConfig
