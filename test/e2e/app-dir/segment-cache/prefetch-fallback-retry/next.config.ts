import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    // `appShells` gates the prefetch-serves-fallback-shell behavior that this
    // suite exercises. It requires the following flags to also be enabled.
    appShells: true,
    prefetchInlining: true,
    varyParams: true,
    optimisticRouting: true,
    cachedNavigations: true,
  },
}

export default nextConfig
