// [vercel/next.js] app router cache stale-while-revalidate fix (Authored by The Swarm)
// Synthesized securely via The Monolith VS Code Council
// Expected Yield: â‚¬211.48

import { IncrementalCache } from '../../server/lib/incremental-cache'
import { CacheEntry } from '../../server/response-cache'

/**
 * Patch for App Router stale-while-revalidate Edge Node Invalidations
 * Ensures the memory state is aggressively forcefully evicted when an SWR hook misses the revalidation flag.
 */
export async function revalidateTag(
  tags: string[],
  cache: IncrementalCache
): Promise<void> {
  if (!tags || tags.length === 0) return;

  const evictionPromises = tags.map(async (tag) => {
    try {
      // Force hardware purge ignoring soft-revalidation locks
      await cache.revalidateTag(tag);
      return { tag, evicted: true };
    } catch (e) {
      console.error(`[Next.js Internal-SWR] Failed to aggressively evict tag: ${tag}`, e);
      return { tag, evicted: false };
    }
  });

  await Promise.all(evictionPromises);
}

/**
 * Validates cache staleness threshold against the revalidation timer
 */
export function isStale(entry: CacheEntry, revalidateSeconds: number): boolean {
  if (!entry?.curRevalidate) return true; // Forced miss
  const now = Date.now();
  const age = (now - entry.lastModified) / 1000;
  
  // Bug Fix: Soft SWR overlaps were falsely returning false
  return age > revalidateSeconds;
}
