/**
 * Node in the doubly-linked list used for LRU tracking.
 * Each node represents a cache entry with bidirectional pointers.
 */
class LRUNode<T> {
  public readonly key: string
  public data: T
  public size: number
  public prev: LRUNode<T> | SentinelNode<T> | null = null
  public next: LRUNode<T> | SentinelNode<T> | null = null

  constructor(key: string, data: T, size: number) {
    this.key = key
    this.data = data
    this.size = size
  }
}

/**
 * Sentinel node used for head/tail boundaries.
 * These nodes don't contain actual cache data but simplify list operations.
 */
class SentinelNode<T> {
  public prev: LRUNode<T> | SentinelNode<T> | null = null
  public next: LRUNode<T> | SentinelNode<T> | null = null
}

/**
 * LRU (Least Recently Used) Cache implementation using a doubly-linked list
 * and hash map for O(1) operations.
 *
 * Algorithm:
 * - Uses a doubly-linked list to maintain access order (most recent at head)
 * - Hash map provides O(1) key-to-node lookup
 * - Sentinel head/tail nodes simplify edge case handling
 * - Size-based eviction supports custom size calculation functions
 *
 * Data Structure Layout:
 * HEAD <-> [most recent] <-> ... <-> [least recent] <-> TAIL
 *
 * Operations:
 * - get(): Move accessed node to head (mark as most recent)
 * - set(): Add new node at head, evict from tail if over capacity
 * - Eviction: Remove least recent node (tail.prev) when size exceeds limit
 */
export class LRUCache<T> {
  private readonly cache: Map<string, LRUNode<T>> = new Map()
  private readonly head: SentinelNode<T>
  private readonly tail: SentinelNode<T>
  private totalSize: number = 0
  private readonly maxSize: number
  private readonly calculateSize: ((value: T) => number) | undefined

  constructor(maxSize: number, calculateSize?: (value: T) => number) {
    this.maxSize = maxSize
    this.calculateSize = calculateSize

    // Create sentinel nodes to simplify doubly-linked list operations
    // HEAD <-> TAIL (empty list)
    this.head = new SentinelNode<T>()
    this.tail = new SentinelNode<T>()
    this.head.next = this.tail
    this.tail.prev = this.head
  }

  /**
   * Adds a node immediately after the head (marks as most recently used).
   * Used when inserting new items or when an item is accessed.
   * PRECONDITION: node must be disconnected (prev/next should be null)
   */
  private addToHead(node: LRUNode<T>): void {
    node.prev = this.head
    node.next = this.head.next
    // head.next is always non-null (points to tail or another node)
    this.head.next!.prev = node
    this.head.next = node
  }

  /**
   * Removes a node from its current position in the doubly-linked list.
   * Updates the prev/next pointers of adjacent nodes to maintain list integrity.
   * PRECONDITION: node must be connected (prev/next are non-null)
   */
  private removeNode(node: LRUNode<T>): void {
    // Connected nodes always have non-null prev/next
    node.prev!.next = node.next
    node.next!.prev = node.prev
  }

  /**
   * Moves an existing node to the head position (marks as most recently used).
   * This is the core LRU operation - accessed items become most recent.
   */
  private moveToHead(node: LRUNode<T>): void {
    this.removeNode(node)
    this.addToHead(node)
  }

  /**
   * Removes and returns the least recently used node (the one before tail).
   * This is called during eviction when the cache exceeds capacity.
   * PRECONDITION: cache is not empty (ensured by caller)
   */
  private removeTail(): LRUNode<T> {
    const lastNode = this.tail.prev as LRUNode<T>
    // tail.prev is always non-null and always LRUNode when cache is not empty
    this.removeNode(lastNode)
    return lastNode
  }

  /**
   * Sets a key-value pair in the cache.
   * If the key exists, updates the value and moves to head.
   * If new, adds at head and evicts from tail if necessary.
   *
   * Time Complexity:
   * - O(1) for uniform item sizes
   * - O(k) where k is the number of items evicted (can be O(N) for variable sizes)
   */
  public set(key: string, value: T): void {
    const size = this.calculateSize?.(value) ?? 1
    if (size > this.maxSize) {
      console.warn('Single item size exceeds maxSize')
      return
    }

    const existing = this.cache.get(key)
    if (existing) {
      // Update existing node: adjust size and move to head (most recent)
      existing.data = value
      this.totalSize = this.totalSize - existing.size + size
      existing.size = size
      this.moveToHead(existing)
    } else {
      // Add new node at head (most recent position)
      const newNode = new LRUNode(key, value, size)
      this.cache.set(key, newNode)
      this.addToHead(newNode)
      this.totalSize += size
    }

    // Evict least recently used items until under capacity
    while (this.totalSize > this.maxSize && this.cache.size > 0) {
      const tail = this.removeTail()
      this.cache.delete(tail.key)
      this.totalSize -= tail.size
    }
  }

  /**
   * Checks if a key exists in the cache.
   * This is a pure query operation - does NOT update LRU order.
   *
   * Time Complexity: O(1)
   */
  public has(key: string): boolean {
    return this.cache.has(key)
  }

  /**
   * Retrieves a value by key and marks it as most recently used.
   * Moving to head maintains the LRU property for future evictions.
   *
   * Time Complexity: O(1)
   */
  public get(key: string): T | undefined {
    const node = this.cache.get(key)
    if (!node) return undefined

    // Mark as most recently used by moving to head
    this.moveToHead(node)

    return node.data
  }

  /**
   * Returns an iterator over the cache entries. The order is outputted in the
   * order of most recently used to least recently used.
   */
  public *[Symbol.iterator](): IterableIterator<[string, T]> {
    let current = this.head.next
    while (current && current !== this.tail) {
      // Between head and tail, current is always LRUNode
      const node = current as LRUNode<T>
      yield [node.key, node.data]
      current = current.next
    }
  }

  /**
   * Removes a specific key from the cache.
   * Updates both the hash map and doubly-linked list.
   *
   * Time Complexity: O(1)
   */
  public remove(key: string): void {
    const node = this.cache.get(key)
    if (!node) return

    this.removeNode(node)
    this.cache.delete(key)
    this.totalSize -= node.size
  }

  /**
   * Returns the number of items in the cache.
   */
  public get size(): number {
    return this.cache.size
  }

  /**
   * Returns the current total size of all cached items.
   * This uses the custom size calculation if provided.
   */
  public get currentSize(): number {
    return this.totalSize
  }
}
