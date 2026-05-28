/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Disabling prefetch inlining avoids the `InliningHintsStale` marker
    // that would otherwise immediately expire the initial-state route
    // cache entry. The bug under test depends on that entry sticking
    // around long enough to be read by `router.replace('/')`.
    prefetchInlining: false,
  },
}

module.exports = nextConfig
