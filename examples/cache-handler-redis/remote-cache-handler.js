const { createClient } = require("redis");
const { PHASE_PRODUCTION_BUILD } = require("next/constants");

// A custom `cacheHandlers.remote` handler backed by Redis. This is a different
// interface from the singular `cacheHandler` (in `cache-handler.js`): it backs
// the `'use cache: remote'` directive, its entries are streams, and it tracks
// tag revalidation by timestamp.
//
// See https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers

const ENTRY_PREFIX = "nextjs:use-cache:";
const TAG_PREFIX = "nextjs:use-cache-tag:";

const client = createClient({
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
  // Fail commands immediately while the connection is down instead of queueing
  // them until Redis is back. Combined with the `isReady` check in
  // `getClient`, a request never waits on an unavailable Redis.
  disableOfflineQueue: true,
});

client.on("error", (error) => {
  if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
    console.warn("Redis client error (remote cache):", error);
  }
});

// Connecting to Redis during `next build` can cause issues, so we only connect
// at runtime. The client keeps retrying in the background if Redis is
// unavailable, so nothing awaits this promise: `connect()` does not settle
// until a connection succeeds, and awaiting it would block requests for as
// long as Redis is down.
if (process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
  client.connect().catch((error) => {
    console.warn("Failed to connect to Redis (remote cache):", error);
  });
}

// Return the client when it's connected, or `null` when Redis is unavailable
// so `'use cache: remote'` degrades to a miss instead of hanging the request.
// The client reconnects on its own once Redis is reachable again.
function getClient() {
  return client.isReady ? client : null;
}

module.exports = {
  async get(cacheKey) {
    const redis = getClient();
    if (!redis) return undefined;

    let stored;
    try {
      stored = await redis.get(ENTRY_PREFIX + cacheKey);
    } catch (error) {
      // A dropped connection mid-request degrades to a cache miss.
      if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
        console.warn("Redis get failed (remote cache):", error);
      }
      return undefined;
    }
    if (!stored) return undefined;

    const data = JSON.parse(stored);

    // Only `expire` means the entry is unusable. Past `revalidate` it's stale,
    // not expired: return it so Next.js can serve it while it refreshes in the
    // background. (`expire: Infinity` never trips this, which is intended.)
    if (Date.now() > data.timestamp + data.expire * 1000) {
      return undefined;
    }

    return {
      // `value` must be a stream; rebuild it from the stored bytes.
      value: new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from(data.value, "base64"));
          controller.close();
        },
      }),
      tags: data.tags,
      stale: data.stale,
      timestamp: data.timestamp,
      expire: data.expire,
      revalidate: data.revalidate,
    };
  },

  async set(cacheKey, pendingEntry) {
    const redis = getClient();
    if (!redis) return;

    // The entry may still be streaming, so await it, then drain the stream.
    const entry = await pendingEntry;

    const reader = entry.value.getReader();
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));

    // A TTL needs a positive integer. By definition, `expire: Infinity`
    // ("never expire") maps to no TTL at all, so omit it and let Redis persist
    // the key.
    const options = Number.isFinite(entry.expire)
      ? {
          expiration: {
            type: "EX",
            value: Math.max(1, Math.ceil(entry.expire)),
          },
        }
      : {};

    try {
      await redis.set(
        ENTRY_PREFIX + cacheKey,
        JSON.stringify({
          value: bytes.toString("base64"),
          tags: entry.tags,
          stale: entry.stale,
          timestamp: entry.timestamp,
          expire: entry.expire,
          revalidate: entry.revalidate,
        }),
        options,
      );
    } catch (error) {
      if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
        console.warn("Redis set failed (remote cache):", error);
      }
    }
  },

  // Redis is the single source of truth and every read hits it, so there's no
  // local tag state to sync between requests.
  async refreshTags() {},

  // Return the most recent revalidation time across `tags`. Next treats an
  // entry as stale when this is newer than the entry's `timestamp`.
  async getExpiration(tags) {
    const redis = getClient();
    if (!redis || !tags.length) return 0;

    try {
      const values = await redis.mGet(tags.map((tag) => TAG_PREFIX + tag));
      const timestamps = values.filter(Boolean).map(Number);
      return timestamps.length ? Math.max(...timestamps) : 0;
    } catch (error) {
      if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
        console.warn("Redis getExpiration failed (remote cache):", error);
      }
      return 0;
    }
  },

  // Record when each tag was last revalidated so `getExpiration` can report
  // it. There's one key per distinct tag, overwritten in place, so a small
  // fixed tag set (like this example's single `time-data` tag) never grows.
  //
  // An app that mints many distinct, short-lived tags (e.g. `user-<id>`) would
  // instead keep a key per tag forever. To bound that, give each key a TTL
  // (`{ expiration: { type: "EX", value } }`) at least as long as your longest
  // entry `expire`: the timestamp only needs to outlive entries created before
  // this revalidation, so a shorter TTL could drop it while such an entry is
  // still cached and serve it as fresh when it should be stale.
  async updateTags(tags) {
    const redis = getClient();
    if (!redis) return;

    const now = String(Date.now());
    try {
      await Promise.all(tags.map((tag) => redis.set(TAG_PREFIX + tag, now)));
    } catch (error) {
      if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
        console.warn("Redis updateTags failed (remote cache):", error);
      }
    }
  },
};
