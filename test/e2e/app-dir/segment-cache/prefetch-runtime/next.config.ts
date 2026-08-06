import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  productionBrowserSourceMaps: true,
  experimental: {
    // TODO: This test asserts on the pre-`varyParams` cache-keying behavior
    // for root params. Pin the fixture to the old default until the test is
    // updated to reflect the new shape (or until the flag is removed).
    varyParams: false,
  },
}

export default nextConfig
