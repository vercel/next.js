export type LRU<T extends LRUNode> = {
  put(node: T): void
  delete(node: T): void
  updateSize(node: T, size: number): void
}

// Doubly-linked list
type LRUNode<T = any> = {
  // Although it's not encoded in the type, these are both null if the node is
  // not in the LRU; both non-null if it is.
  prev: T | null
  next: T | null
  size: number
}

// Rather than create an internal LRU node, the passed-in type must conform
// the LRUNode interface. This is just a memory optimization to avoid creating
// another object; we only use this for Segment Cache entries so it doesn't need
// to be general purpose.
export function createLRU<T extends LRUNode>(
  // From the LRU's perspective, the size unit is arbitrary, but for our
  // purposes this is the byte size.
  maxLruSize: number,
  onEviction: (node: T) => void
): LRU<T> {
  let head: T | null = null
  let didScheduleCleanup: boolean = false
  let lruSize: number = 0

  function put(node: T) {
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
      tail.next = node
      node.next = head
      head.prev = node
    }
    head = node
  }

  function updateSize(node: T, newNodeSize: number) {
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

  function deleteNode(deleted: T) {
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
    // `deleteNode` sets `head` to `null` when we run out entries.
    const ninetyPercentMax = maxLruSize * 0.9
    while (lruSize > ninetyPercentMax && head !== null) {
      const tail = head.prev
      deleteNode(tail)
      onEviction(tail)
    }
  }

  return {
    put,
    delete: deleteNode,
    updateSize,
  }
}

const requestCleanupCallback =
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 0)
