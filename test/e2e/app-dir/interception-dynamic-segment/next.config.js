/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    // Exercise explicit children detection with interception routes. Named-only
    // intercepted layouts omit children, while a real children branch still
    // uses the marker needed to preserve its active state during navigation.
    explicitParallelRouteChildren: true,
    // Interception catch-alls retain every sibling owned by the host layout.
    // Strict matching must not mistake those retained slots for incomplete
    // route coverage and prune the interception matcher.
    strictRouteMatching: true,
  },
}

module.exports = nextConfig
