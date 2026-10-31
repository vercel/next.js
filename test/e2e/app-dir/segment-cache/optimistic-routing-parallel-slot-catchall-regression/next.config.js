/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    optimisticRouting: true,
  },
  // The bug being regressed requires the response for /[teamSlug] to
  // exercise its `@actions/[...catchAll]` parallel slot even though the
  // canonical URL has no parts left to feed the catch-all. The simplest
  // reproducer is a rewrite that maps the single-segment URL into a
  // longer destination: the response describes a route shape that
  // includes the catch-all slot, but the canonical URL is short enough
  // that no parts reach the catch-all under normal routing.
  async rewrites() {
    return [
      {
        source: '/:teamSlug',
        destination: '/:teamSlug/overview',
      },
    ]
  },
}

module.exports = nextConfig
