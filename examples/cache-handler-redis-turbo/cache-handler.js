/**
 * ISR / Pages Router cache handler (singular `cacheHandler` API).
 *
 * Uses `RedisStringsHandler` from `@trieb.work/nextjs-turbo-redis-cache`.
 * During `PHASE_PRODUCTION_BUILD` the handler is replaced with a no-op so
 * `next build` does not require a running Redis instance.
 */
const { PHASE_PRODUCTION_BUILD } = require("next/constants");

let cachedHandler;

class CacheHandler {
  constructor() {
    if (cachedHandler) {
      return cachedHandler;
    }

    // No-op during build phase — Redis is a runtime concern only.
    if (PHASE_PRODUCTION_BUILD === process.env.NEXT_PHASE) {
      cachedHandler = {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(undefined),
        revalidateTag: () => Promise.resolve(undefined),
        resetRequestCache: () => Promise.resolve(undefined),
      };
      return cachedHandler;
    }

    // Lazily import so the Redis client is only created at runtime.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const {
      RedisStringsHandler,
    } = require("@trieb.work/nextjs-turbo-redis-cache");

    cachedHandler = new RedisStringsHandler({
      // REDIS_URL is recommended; falls back to REDISHOST/REDISPORT, then
      // redis://localhost:6379.
      // redisUrl: process.env.REDIS_URL,
      // Optional: isolate cache entries per deployment.
      // keyPrefix: process.env.VERCEL_URL ?? "turbo-example:",
    });

    return cachedHandler;
  }

  get(...args) {
    return cachedHandler.get(...args);
  }
  set(...args) {
    return cachedHandler.set(...args);
  }
  revalidateTag(...args) {
    return cachedHandler.revalidateTag(...args);
  }
  resetRequestCache(...args) {
    return cachedHandler.resetRequestCache(...args);
  }
}

module.exports = CacheHandler;
