/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
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
    staleTimes: {
      dynamic: 180,
    },
  },
}

module.exports = nextConfig
