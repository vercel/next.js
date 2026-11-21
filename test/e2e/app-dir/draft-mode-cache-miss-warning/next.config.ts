import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Partial Prefetching is the navigation model that rides on top of Partial
  // Prerendering. A document request fills caches, then a final runtime
  // prerender expects those entries to be present.
  partialPrefetching: true,
}

export default nextConfig
