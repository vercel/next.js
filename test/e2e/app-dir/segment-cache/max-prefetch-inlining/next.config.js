/**
 * Setting both thresholds to Infinity inlines all segments into a single
 * response per route, approximating pre-Segment Cache (pre-Next 16)
 * prefetching behavior where all data was bundled into one response. The
 * tradeoff is that per-layout deduplication across routes is lost.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    prefetchInlining: {
      maxSize: Infinity,
      maxBundleSize: Infinity,
    },
  },
}

module.exports = nextConfig
