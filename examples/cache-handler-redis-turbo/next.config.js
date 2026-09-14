/**
 * Next.js config for the cache-handler-redis-turbo example.
 *
 * This example demonstrates TWO Next.js cache interfaces side by side:
 *
 *  1. `cacheHandler` (singular) — ISR for App and Pages Router, on-demand
 *     revalidation. Pointed at `./cache-handler.js`.
 *  2. `cacheHandlers` (plural) — `'use cache'` with `cacheComponents: true`.
 *     Pointed at `./cache-components-handler.js`.
 *
 * The canonical no-dependency Redis example is `examples/cache-handler-redis`.
 * This example wires the same two APIs through `@trieb.work/nextjs-turbo-redis-cache`.
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
