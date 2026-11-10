/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  // Intermediate (resolved-root-param) entries in this fixture rely on the
  // partialFallback serving contract, which the adapter only emits for
  // apps with Partial Prefetching enabled (vercel/next.js#96074).
  partialPrefetching: true,
}

module.exports = nextConfig
