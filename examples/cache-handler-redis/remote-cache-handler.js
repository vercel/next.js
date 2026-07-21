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
});

client.on("error", (error) => {
  if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
    console.warn("Redis client error (remote cache):", error);
  }
});

const connection =
  process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
    ? Promise.resolve()
    : client.connect().catch((error) => {
        console.warn("Failed to connect to Redis (remote cache):", error);
      });

async function getClient() {
  await connection;
  return client.isReady ? client : null;
}

module.exports = {
  async get(cacheKey) {
    const redis = await getClient();
    if (!redis) return undefined;

    const stored = await redis.get(ENTRY_PREFIX + cacheKey);
    if (!stored) return undefined;

    const data = JSON.parse(stored);

    // Drop the entry once it's past its revalidate window.
    if (Date.now() > data.timestamp + data.revalidate * 1000) {
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
    const redis = await getClient();
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
      // Let Redis expire the entry automatically.
      { EX: Math.max(1, Math.ceil(entry.expire)) },
    );
  },

  // Redis is the single source of truth and every read hits it, so there's no
  // local tag state to sync between requests.
  async refreshTags() {},

  // Return the most recent revalidation time across `tags`. Next treats an
  // entry as stale when this is newer than the entry's `timestamp`.
  async getExpiration(tags) {
    const redis = await getClient();
    if (!redis || !tags.length) return 0;

    const values = await redis.mGet(tags.map((tag) => TAG_PREFIX + tag));
    const timestamps = values.filter(Boolean).map(Number);
    return timestamps.length ? Math.max(...timestamps) : 0;
  },

  // Record when each tag was revalidated so `getExpiration` can report it.
  async updateTags(tags) {
    const redis = await getClient();
    if (!redis) return;

    const now = String(Date.now());
    await Promise.all(tags.map((tag) => redis.set(TAG_PREFIX + tag, now)));
  },
};
