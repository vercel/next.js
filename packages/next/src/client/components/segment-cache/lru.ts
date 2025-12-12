import type { MapEntry } from './cache-map'
import { deleteMapEntry } from './cache-map'

// We use an LRU for memory management. We must update this whenever we add or
// remove a new cache entry, or when an entry changes size.

// The MapEntry type is used as an LRU node, too. We choose this one instead of
// the inner cache entry type (RouteCacheEntry, SegmentCacheEntry) because it's
// monomorphic and can be optimized by the VM.
type LRUNode = MapEntry<any>

let head: LRUNode | null = null
let didScheduleCleanup: boolean = false
let lruSize: number = 0

// TODO: I chose the max size somewhat arbitrarily. Consider setting this based
// on navigator.deviceMemory, or some other heuristic. We should make this
// customizable via the Next.js config, too.
const maxLruSize = 50 * 1024 * 1024 // 50 MB

export function lruPut(node: LRUNode) {
  if (head === node) {
    // Already at the head
    return
  }
  const prev = node.prev
  const next = node.next
  if (next === null || prev === null) {
    // This is an insertion
    lruSize += node.size
    // Whenever we add an entry, we need to check if we've exceeded the
    // max size. We don't evict entries immediately; they're evicted later in
    // an asynchronous task.
    ensureCleanupIsScheduled()
  } else {
    // This is a move. Remove from its current position.
    prev.next = next
    next.prev = prev
  }

  // Move to the front of the list
  if (head === null) {
    // This is the first entry
    node.prev = node
    node.next = node
  } else {
    // Add to the front of the list
    const tail = head.prev
    node.prev = tail
    // In practice, this is never null, but that isn't encoded in the type
    if (tail !== null) {
      tail.next = node
    }
    node.next = head
    head.prev = node
  }
  head = node
}

export function updateLruSize(node: LRUNode, newNodeSize: number) {
  // This is a separate function from `put` so that we can resize the entry
  // regardless of whether it's currently being tracked by the LRU.
  const prevNodeSize = node.size
  node.size = newNodeSize
  if (node.next === null) {
    // This entry is not currently being tracked by the LRU.
    return
  }
  // Update the total LRU size
  lruSize = lruSize - prevNodeSize + newNodeSize
  ensureCleanupIsScheduled()
}

export function deleteFromLru(deleted: LRUNode) {
  const next = deleted.next
  const prev = deleted.prev
  if (next !== null && prev !== null) {
    lruSize -= deleted.size

    deleted.next = null
    deleted.prev = null

    // Remove from the list
    if (head === deleted) {
      // Update the head
      if (next === head) {
        // This was the last entry
        head = null
      } else {
        head = next
      }
    } else {
      prev.next = next
      next.prev = prev
    }
  } else {
    // Already deleted
  }
}

function ensureCleanupIsScheduled() {
  if (didScheduleCleanup || lruSize <= maxLruSize) {
    return
  }
  didScheduleCleanup = true
  requestCleanupCallback(cleanup)
}

function cleanup() {
  didScheduleCleanup = false

  // Evict entries until we're at 90% capacity. We can assume this won't
  // infinite loop because even if `maxLruSize` were 0, eventually
  // `deleteFromLru` sets `head` to `null` when we run out entries.
  const ninetyPercentMax = maxLruSize * 0.9
  while (lruSize > ninetyPercentMax && head !== null) {
    const tail = head.prev
    // In practice, this is never null, but that isn't encoded in the type
    if (tail !== null) {
      // Delete the entry from the map. In turn, this will remove it from
      // the LRU.
      deleteMapEntry(tail)
    }
  }
}

const requestCleanupCallback =
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 0)
