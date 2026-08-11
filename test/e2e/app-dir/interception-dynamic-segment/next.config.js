/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    // Exercise strict matching's interception behavior. Named-only intercepted
    // layouts omit children, while a real children branch still uses the
    // default marker needed to preserve its active state during navigation.
    strictRouteMatching: true,
  },
}

module.exports = nextConfig
