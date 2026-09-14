/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    coldCacheBadge: true,
  },
  // Route the default `"use cache"` kind through a custom handler that
  // simulates a remote cache (its `get` has macro-task latency). In dev this is
  // fronted by a built-in in-memory handler so warm reads still resolve in a
  // microtask.
  cacheHandlers: {
    default: require.resolve('./handler.js'),
  },
}

module.exports = nextConfig
