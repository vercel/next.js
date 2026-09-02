import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Fallback shells are only flagged upgradeable (and upgraded) when Partial
  // Prefetching is enabled; this suite exercises that upgrade + client-retry
  // path. The links opt into `prefetch={true}` because a Partial Prefetching
  // app skips the speculative prefetch otherwise.
  partialPrefetching: true,
  experimental: {
    prefetchInlining: true,
    varyParams: true,
    optimisticRouting: true,
    cachedNavigations: true,
  },
}

export default nextConfig
