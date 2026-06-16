import type { CacheEntry, CacheHandler } from '../lib/cache-handlers/types'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { cloneCacheEntry } from './clone-cache-entry'

/**
 * The subset of the cache-handler interface used on the per-invocation
 * read/write path in the "use cache" wrapper. Tag operations are intentionally
 * excluded: they are applied to the front and backing handlers individually by
 * the registry iterators (`getCacheHandlers` / `getCacheHandlerEntries`), never
 * through this composite, so the composite is never registered.
 */
export type CacheReadWriteHandler = Pick<CacheHandler, 'get' | 'set'>

/**
 * Development-only. Puts a fast built-in in-memory `front` handler in front of
 * a slower or persistent user-configured `backing` handler. Its only job is to
 * guarantee that warm reads resolve in a microtask (so they aren't counted as
 * cache misses at a staged-render boundary, which would otherwise surface a
 * cold cache indicator), while keeping the front in sync with the backing.
 *
 * It implements only `get` and `set` because that is all the wrapper calls on
 * its handler. Regeneration is never done here; this only reads, mirrors, and
 * writes through.
 *
 * The handler is a per-kind singleton (the front and backing are both shared),
 * so its in-flight map can serialize background front syncs for a key across
 * concurrent reads, running them one at a time instead of in parallel.
 */
export function createTieredCacheHandler(
  front: CacheHandler,
  backing: CacheHandler
): CacheReadWriteHandler {
  // Holds the in-flight (or chained) background sync per key, so a sync for a
  // key runs after any earlier one for that key rather than in parallel.
  const inFlightSyncs = new Map<string, Promise<void>>()

  function scheduleBackgroundSync(
    cacheKey: string,
    sync: () => Promise<void>
  ): void {
    // Serialize syncs per key: chain this one after any in-flight sync rather
    // than running a second in parallel. The trailing sync still re-reads the
    // backing, so the front converges to the latest state; a later read is
    // never dropped in favor of an earlier, possibly stale, in-flight read.
    const previous = inFlightSyncs.get(cacheKey)

    let pending: Promise<void>
    if (previous) {
      pending = previous.then(sync)
    } else {
      pending = sync()
    }

    pending = pending.finally(() => {
      if (inFlightSyncs.get(cacheKey) === pending) {
        inFlightSyncs.delete(cacheKey)
      }
    })

    inFlightSyncs.set(cacheKey, pending)

    // Register the sync on the current request's revalidation writes so it is
    // awaited rather than left untracked. Reading the work store here (rather
    // than capturing it at construction) is what lets the handler be a shared
    // singleton; `get` always runs within the request's async context, so the
    // store is present.
    const workStore = workAsyncStorage.getStore()
    if (workStore) {
      workStore.pendingRevalidateWrites ??= []
      workStore.pendingRevalidateWrites.push(pending)
    }
  }

  return {
    async get(cacheKey, softTags) {
      const frontEntry = await front.get(cacheKey, softTags)

      if (frontEntry) {
        // Warm hit: serve immediately (in a microtask). A background reconcile
        // keeps the front in sync with the backing for the next read;
        // reconciles for the same key are serialized, so concurrent warm reads
        // don't hit the backing in parallel.
        scheduleBackgroundSync(cacheKey, () =>
          reconcileFrontFromBacking(
            front,
            backing,
            cacheKey,
            softTags,
            frontEntry
          )
        )

        return frontEntry
      }

      // Cold or evicted front entry: we pay the backing latency here (this is a
      // read that may legitimately surface a cold cache indicator). A miss
      // returns undefined and the "use cache" wrapper generates the entry and
      // writes it through both tiers via `set`.
      const backingEntry = await backing.get(cacheKey, softTags)

      if (!backingEntry) {
        return undefined
      }

      // Mirror this freshly read backing entry into the front so the next read
      // is warm. The mirror is serialized per key: if a sync is already
      // running, this chains after it, so the front converges to this read even
      // if the backing changed since that sync started.
      const [servedEntry, mirroredEntry] = cloneCacheEntry(backingEntry)
      scheduleBackgroundSync(cacheKey, () =>
        mirrorIntoFront(front, cacheKey, mirroredEntry)
      )

      return servedEntry
    },

    async set(cacheKey, pendingEntry) {
      // Write through to both tiers. The entry's value stream is single-use, so
      // tee it into one entry per tier.
      const entry = await pendingEntry
      const [frontEntry, backingEntry] = cloneCacheEntry(entry)

      await Promise.all([
        front.set(cacheKey, Promise.resolve(frontEntry)),
        backing.set(cacheKey, Promise.resolve(backingEntry)),
      ])
    },
  }
}

/**
 * After serving a warm front hit, consult the backing and mirror a newer entry
 * into the front for the next read. Runs in the background; failures are
 * non-fatal.
 */
async function reconcileFrontFromBacking(
  front: CacheHandler,
  backing: CacheHandler,
  cacheKey: string,
  softTags: string[],
  frontEntry: CacheEntry
): Promise<void> {
  try {
    const backingEntry = await backing.get(cacheKey, softTags)

    if (!backingEntry) {
      // The backing no longer has this entry (it was purged out-of-band). The
      // cache-handler interface has no per-key delete, so evict the front entry
      // by overwriting it with an already-expired copy: the next read sees a
      // front miss, falls through to the (also empty) backing, and the wrapper
      // regenerates. The entry we just served was the last stale read.
      await front.set(cacheKey, Promise.resolve(toExpiredEntry(frontEntry)))

      return
    }

    if (backingEntry.timestamp > frontEntry.timestamp) {
      await front.set(cacheKey, Promise.resolve(backingEntry))
    } else {
      // The front is already up to date, so the backing entry goes unused.
      // Release its stream without awaiting: a teed stream's `cancel()` only
      // settles once the sibling branch (retained by the backing handler) is
      // also cancelled, so awaiting it here would hang the reconcile.
      void backingEntry.value.cancel()
    }
  } catch {
    // Background warming; failures are non-fatal.
  }
}

/**
 * Mirror a backing entry into the front.
 */
async function mirrorIntoFront(
  front: CacheHandler,
  cacheKey: string,
  entry: CacheEntry
): Promise<void> {
  try {
    await front.set(cacheKey, Promise.resolve(entry))
  } catch {
    // Background warming; failures are non-fatal.
  }
}

/**
 * Build an already-expired copy of an entry, used to evict it from the front
 * handler (which has no per-key delete) once the backing no longer has it. In
 * dev the default handler treats an entry as missing once `now > timestamp +
 * expire * 1000`, so `expire: 0` against the original (past) timestamp makes
 * the next read a miss. The value is never read once the entry is expired, but
 * it must carry at least one byte because the built-in LRU cache refuses to
 * store size-0 entries.
 */
function toExpiredEntry(entry: CacheEntry): CacheEntry {
  return {
    ...entry,
    expire: 0,
    value: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1))
        controller.close()
      },
    }),
  }
}
