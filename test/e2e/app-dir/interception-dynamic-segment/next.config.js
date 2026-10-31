/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    // Exercise explicit children detection with interception routes. Named-only
    // intercepted layouts omit children, while a real children branch still
    // uses the marker needed to preserve its active state during navigation.
    explicitParallelRouteChildren: true,
  },
}

module.exports = nextConfig
