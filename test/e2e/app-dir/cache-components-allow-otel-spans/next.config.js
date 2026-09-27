/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  // Keep Partial Prefetching enabled to cover the first request to an unknown
  // param while rendering and caching its shell.
  partialPrefetching: true,
}

module.exports = nextConfig
