/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheLife: {
    // Override the built-in `default` profile so that every `'use cache'`
    // without an inline `cacheLife()` is dynamic (client-only) by default.
    // `revalidate` and `stale` are backfilled from the built-in default. This
    // is the configuration where a short default profile used to trip the
    // nested-cache "no explicit cacheLife" build error on a cache that isn't
    // nested at all.
    default: { expire: 0 },
  },
}

module.exports = nextConfig
