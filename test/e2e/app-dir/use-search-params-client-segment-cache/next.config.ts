import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    ppr: true,
    // FIXME: Should also work when DIO is enabled.
    // dynamicIO: true,
    clientSegmentCache: true,
    removeUncaughtErrorAndRejectionListeners: true,
  },
}

export default nextConfig
