import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // TODO(appShells): migrate this test to the two-phase (app shell +
    // per-page data) prefetch behavior, then remove this override. See #94516.
    appShells: false,
  },

  cacheComponents: true,
}

export default nextConfig
