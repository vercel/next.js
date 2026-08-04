/**
 * Next.js config for the cache-handler-redis-turbo example.
 *
 * This example demonstrates TWO Next.js cache interfaces side by side:
 *
 *  1. `cacheHandler` (singular) — used by ISR / Pages Router / on-demand
 *     revalidation. Pointed at `./cache-handler.js`.
 *  2. `cacheHandlers` (plural) — used by the `'use cache'` directive and
 *     `cacheComponents: true` (Next.js 16+). Pointed at
 *     `./cache-components-handler.js`.
 *
 * The existing `examples/cache-handler-redis` example only covers (1) via
 * `@neshca/cache-handler`, which does not support Next.js 16 Cache Components.
 * This example shows both, using `@trieb.work/nextjs-turbo-redis-cache`.
 *
 * Redis is only needed at runtime, not at build time. The handlers below
 * no-op during `PHASE_PRODUCTION_BUILD` so `next build` works without a
 * running Redis instance.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 16+ Cache Components: enables the `'use cache'` directive.
  cacheComponents: true,
  // ISR / Pages Router / on-demand revalidation handler.
  cacheHandler:
    process.env.NODE_ENV === "production"
      ? require.resolve("./cache-handler.js")
      : undefined,
  // `'use cache'` directive handler (plural API, Next.js 16+).
  cacheHandlers: {
    default: require.resolve("./cache-components-handler.js"),
  },
  env: {
    NEXT_PUBLIC_REDIS_INSIGHT_URL:
      process.env.REDIS_INSIGHT_URL ?? "http://localhost:8001",
  },
};

module.exports = nextConfig;
