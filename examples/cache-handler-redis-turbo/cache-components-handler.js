/**
 * Cache Components handler (plural `cacheHandlers` API, Next.js 16+).
 *
 * Used by the `'use cache'` directive, `cacheTag`, `cacheLife`, and
 * `revalidateTag` when `cacheComponents: true` is set in `next.config.js`.
 *
 * `@trieb.work/nextjs-turbo-redis-cache` ships a ready-to-export
 * `redisCacheHandler` singleton that implements the full plural interface
 * (`get`, `set`, `refreshTags`, `getExpiration`, `updateTags`).
 *
 * During `PHASE_PRODUCTION_BUILD` we export a no-op so `next build` works
 * without a running Redis instance.
 */
const { PHASE_PRODUCTION_BUILD } = require("next/constants");

const isBuildPhase = PHASE_PRODUCTION_BUILD === process.env.NEXT_PHASE;

if (isBuildPhase) {
  // No-op handler — Redis is a runtime concern only.
  module.exports = {
    get: () => Promise.resolve(undefined),
    set: () => Promise.resolve(),
    refreshTags: () => Promise.resolve(),
    getExpiration: () => Promise.resolve(0),
    updateTags: () => Promise.resolve(),
  };
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { redisCacheHandler } = require("@trieb.work/nextjs-turbo-redis-cache");
  module.exports = redisCacheHandler;
}
