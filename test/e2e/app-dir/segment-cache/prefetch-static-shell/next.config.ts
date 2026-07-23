import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Opt every route into Partial Prefetching globally: segments without a
  // per-segment `prefetch` export default to 'partial'. The speculative-*
  // fixtures override this with `prefetch = 'allow-runtime'`.
  partialPrefetching: true,
}

export default nextConfig
