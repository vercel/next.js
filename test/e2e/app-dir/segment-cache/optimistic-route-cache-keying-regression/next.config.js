/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // With Cache Components, a navigation writes segment data into the cache
  // through its embedded runtime prefetch, which needs Partial Prefetching.
  // That's what lets the prefetch in this test find the photo page's
  // segments. Partial Prefetching requires Cache Components, so it's only
  // enabled in that run.
  partialPrefetching: process.env.__NEXT_CACHE_COMPONENTS === 'true',
  experimental: {
    // The client segment cache currently only writes segment data during
    // prefetches, not during navigations. The staleTimes feature is an
    // exception: it preserves route cache entries for reuse across
    // navigations. We rely on this to reproduce the bug — without it,
    // dynamic route cache entries expire immediately, so the second lookup
    // would always miss regardless of whether the key is correct.
    //
    // Once the client cache writes segment data during navigations more
    // broadly, this test could be rewritten without this config.
    prefetchInlining: false,
    staleTimes: {
      dynamic: 180,
    },
  },
}

module.exports = nextConfig
