/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  // Disable the in-memory cache to emulate a deploy environment without one. In
  // development this should still cache (stale-while-revalidate) so reloads
  // stay fast; in production it caches nothing.
  cacheMaxMemorySize: 0,
}

module.exports = nextConfig
