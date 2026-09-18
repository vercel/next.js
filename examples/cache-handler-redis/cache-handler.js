const { createClient } = require("redis");
const { PHASE_PRODUCTION_BUILD } = require("next/constants");

// A custom Next.js cache handler backed by Redis. This implements the cache
// handler interface (`get`, `set`, `revalidateTag`, `resetRequestCache`)
// directly, so no third-party adapter is required.
//
// See https://nextjs.org/docs/app/guides/self-hosting#configuring-caching
// and https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandler

// Prefix cache entries and tag indexes so they're easy to find (and flush)
// in Redis and don't collide with other keys.
const CACHE_PREFIX = "nextjs:cache:";
const TAG_PREFIX = "nextjs:tag:";

// App page/route entries carry their cache tags in this response header
// rather than in `ctx.tags` (which is only populated for fetch entries).
const NEXT_CACHE_TAGS_HEADER = "x-next-cache-tags";

// Cache entries aren't plain JSON: app page entries contain `Buffer`s
// (e.g. `rscData`) and a `Map` (`segmentData`). Plain `JSON.stringify` would
// turn a `Map` into `{}` and lose the buffer types, so we tag those values on
// the way out and rebuild them on the way back in.
function serialize(entry) {
  return JSON.stringify(entry, (_key, value) => {
    if (value instanceof Map) {
      return { __type: "Map", value: Array.from(value.entries()) };
    }
    return value;
  });
}

function deserialize(text) {
  return JSON.parse(text, (_key, value) => {
    if (value && value.__type === "Map") {
      return new Map(value.value);
    }
    // `Buffer#toJSON()` produces `{ type: "Buffer", data: [...] }`.
    if (value && value.type === "Buffer" && Array.isArray(value.data)) {
      return Buffer.from(value.data);
    }
    return value;
  });
}

// Next.js constructs the `cacheHandler` class once per request, so the Redis
// client must live at module scope: creating it in the constructor would open
// a new connection on every request and never close it.
const client = createClient({
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
  // Fail commands immediately while the connection is down instead of queueing
  // them until Redis is back.
  disableOfflineQueue: true,
});

// Redis won't work without error handling. Do not throw here, otherwise the
// client won't reconnect after a connection drop.
client.on("error", (error) => {
  if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
    console.warn("Redis client error:", error);
  }
});

// Connecting to Redis during `next build` can cause issues, so we only connect
// at runtime.
const connection =
  process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
    ? Promise.resolve()
    : client.connect().catch((error) => {
        console.warn("Failed to connect to Redis:", error);
      });

// `connect()` stays pending for as long as Redis is unreachable, so cap the
// wait: requests arriving during startup wait for the connection at most
// once, and while Redis is down every request is served uncached instead of
// blocking. The client keeps retrying in the background, so `isReady` flips
// back on its own once Redis is reachable again.
const CONNECT_TIMEOUT_MS = 1000;
const ready = Promise.race([
  connection,
  // `unref()` so this timer never keeps the process alive.
  new Promise((resolve) => setTimeout(resolve, CONNECT_TIMEOUT_MS).unref()),
]);

// Resolve a connected client, or `null` when Redis is unavailable so the app
// keeps working (without a shared cache) instead of hanging or crashing.
async function getClient() {
  await ready;
  return client.isReady ? client : null;
}

module.exports = class CacheHandler {
  constructor(options) {
    this.options = options;
  }

  async get(key) {
    const client = await getClient();
    if (!client) return null;

    let entry;
    try {
      entry = await client.get(CACHE_PREFIX + key);
    } catch (error) {
      // A connection dropping mid-request degrades to a cache miss.
      if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
        console.warn("Redis get failed:", error);
      }
      return null;
    }

    return entry ? deserialize(entry) : null;
  }

  async set(key, data, ctx) {
    const client = await getClient();
    if (!client || !data) return;

    // Collect tags from both sources: `ctx.tags` (fetch entries) and the
    // `x-next-cache-tags` header (app page/route entries).
    const headerTags = (data.headers?.[NEXT_CACHE_TAGS_HEADER] ?? "")
      .split(",")
      .filter(Boolean);
    const tags = [...new Set([...(ctx?.tags ?? []), ...headerTags])];

    // Let Redis auto-expire the entry when it carries a finite `expire`. Key
    // the TTL on `expire`, never `revalidate`: past `revalidate` the entry is
    // only stale (Next.js serves it while refreshing), so evicting it there
    // would defeat that. ISR entries often omit `expire` entirely, in which
    // case we set no TTL and rely on `revalidateTag` to invalidate.
    const expire = ctx?.cacheControl?.expire;
    const options = Number.isFinite(expire)
      ? { expiration: { type: "EX", value: Math.max(1, Math.ceil(expire)) } }
      : {};

    const value = serialize({ value: data, lastModified: Date.now(), tags });

    try {
      await client.set(CACHE_PREFIX + key, value, options);

      // Index this key under each of its tags so `revalidateTag` can find it.
      await Promise.all(tags.map((tag) => client.sAdd(TAG_PREFIX + tag, key)));
    } catch (error) {
      if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
        console.warn("Redis set failed:", error);
      }
    }
  }

  async revalidateTag(tags) {
    const client = await getClient();
    // Don't report success for a revalidation that never reached Redis: once
    // Redis is back, every instance would serve the old entries again.
    if (!client) {
      throw new Error(
        "Redis is unavailable, so the tag revalidation was not recorded",
      );
    }

    // `tags` is either a single tag or an array of tags.
    for (const tag of [tags].flat()) {
      const tagKey = TAG_PREFIX + tag;
      const keys = await client.sMembers(tagKey);

      if (keys.length) {
        await client.del(keys.map((key) => CACHE_PREFIX + key));
      }

      await client.del(tagKey);
    }
  }

  // Used for an in-memory, per-request cache. Redis is the source of truth
  // here, so there's nothing to reset between requests.
  resetRequestCache() {}
};
