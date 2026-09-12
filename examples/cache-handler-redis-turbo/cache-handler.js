/**
 * ISR cache handler (singular `cacheHandler` API) for App and Pages Router.
 *
 * Next.js constructs this class and calls get/set/revalidateTag on the
 * instance. The constructor only initializes a module-level singleton
 * (`RedisStringsHandler`, or a no-op during `PHASE_PRODUCTION_BUILD`);
 * the methods below delegate to it.
 */
const { PHASE_PRODUCTION_BUILD } = require("next/constants");

let cachedHandler;

class CacheHandler {
  constructor() {
    if (cachedHandler) {
      return;
    }

    // No-op during build phase — Redis is a runtime concern only.
    if (PHASE_PRODUCTION_BUILD === process.env.NEXT_PHASE) {
      cachedHandler = {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(undefined),
        revalidateTag: () => Promise.resolve(undefined),
        resetRequestCache: () => Promise.resolve(undefined),
      };
      return;
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
