/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  // The resolved-root-param assertion covers the partial-fallback arm
  // (intermediate shells emitting a filtered allowQuery +
  // `partialFallback: true`), which the adapter only emits for apps with
  // Partial Prefetching enabled (vercel/next.js#96074). The blocking-arm
  // assertions are independent of this flag.
  partialPrefetching: true,
  adapterPath: require.resolve('./my-adapter.mjs'),
}

module.exports = nextConfig
