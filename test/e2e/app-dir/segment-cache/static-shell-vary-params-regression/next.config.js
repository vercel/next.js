/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  // Partial Prefetching enables the Shell prefetch phase, where the bug lived.
  partialPrefetching: true,
}

module.exports = nextConfig
