/**
 * ISR cache handler (singular `cacheHandler` API) for App and Pages Router.
 *
 * Next.js instantiates this class and calls the methods on the returned object.
 * We therefore return the singleton adapter instance itself after lazy
 * initialization so the `RedisStringsHandler` methods are the ones that receive
 * runtime calls. The wrapper methods below are intentionally omitted; any
 * monitoring logic belongs in the adapter instance and should be wired there.
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
}

module.exports = CacheHandler;
