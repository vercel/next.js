import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Opt the whole app into Partial Prefetching in "eager" mode. Every route's
  // default prefetch config becomes 'unstable_eager', so under App Shells the
  // per-link Speculative prefetch is NOT skipped — even for routes with no
  // per-segment `unstable_prefetch` export.
  partialPrefetching: 'unstable_eager',
  experimental: {
    prefetchInlining: true,
    optimisticRouting: true,
    cachedNavigations: true,
    appShells: true,
    varyParams: true,
  },
}

export default nextConfig
