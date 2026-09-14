/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    optimisticRouting: true,
    varyParams: true,
  },
  // Each rewrite below crafts one of the rewrite-affected response shapes
  // we want to verify. They live in `beforeFiles` so they take precedence
  // over the filesystem dynamic route — otherwise a 1-part URL like
  // /featured would route directly to the filesystem (matched by the
  // dynamic /[teamSlug]) without going through the rewrite, and we'd
  // never observe the rewrite-affected response shape under test.
  async rewrites() {
    return {
      beforeFiles: [
        // Case "static-sibling": URL matches a known static sibling, but
        // the rewrite sends it through the dynamic /[teamSlug] route.
        { source: '/featured', destination: '/some-team' },
        // Case "static-visible-null": URL is shorter than the response,
        // and the deeper segment is a visible static segment.
        { source: '/team-shorter', destination: '/team-shorter/overview' },
        // Case "tree-shorter-than-url": URL is longer than the response.
        { source: '/:teamSlug/garbage', destination: '/:teamSlug' },
      ],
    }
  },
}

module.exports = nextConfig
