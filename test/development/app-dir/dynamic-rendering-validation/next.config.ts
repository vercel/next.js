import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Edge does not support Cache Components. Pin both flags off so the fixture
  // also works in CI jobs that enable cached navigations by default.
  cacheComponents: false,
  experimental: {
    cachedNavigations: false,
  },
}

export default nextConfig
