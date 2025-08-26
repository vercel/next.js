import { LRUCache } from './lru-cache'

describe('LRUCache', () => {
  describe('Basic Operations', () => {
    let cache: LRUCache<string>

    beforeEach(() => {
      cache = new LRUCache<string>(3)
    })

    it('should set and get values', () => {
      cache.set('key1', 'value1')
      expect(cache.get('key1')).toBe('value1')
    })

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined()
    })

    it('should check if key exists with has()', () => {
      cache.set('key1', 'value1')
      expect(cache.has('key1')).toBe(true)
      expect(cache.has('nonexistent')).toBe(false)
    })

    it('should update existing keys', () => {
      cache.set('key1', 'value1')
      cache.set('key1', 'value2')
      expect(cache.get('key1')).toBe('value2')
      expect(cache.size).toBe(1)
    })

    it('should track cache size correctly', () => {
      expect(cache.size).toBe(0)
      cache.set('key1', 'value1')
      expect(cache.size).toBe(1)
      cache.set('key2', 'value2')
      expect(cache.size).toBe(2)
    })
  })

  describe('LRU Eviction Behavior', () => {
    let cache: LRUCache<string>

    beforeEach(() => {
      cache = new LRUCache<string>(3)
    })

    it('should evict least recently used item when capacity exceeded', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')
      cache.set('key4', 'value4') // should evict key1

      expect(cache.has('key1')).toBe(false)
      expect(cache.has('key2')).toBe(true)
      expect(cache.has('key3')).toBe(true)
      expect(cache.has('key4')).toBe(true)
      expect(cache.size).toBe(3)
    })

    it('should update LRU order when accessing items', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')

      cache.get('key1') // key1 becomes most recently used
      cache.set('key4', 'value4') // should evict key2 (least recently used)

      expect(cache.has('key1')).toBe(true)
      expect(cache.has('key2')).toBe(false)
      expect(cache.has('key3')).toBe(true)
      expect(cache.has('key4')).toBe(true)
    })

    it('should maintain correct order with mixed operations', () => {
      cache.set('a', '1')
      cache.set('b', '2')
      cache.set('c', '3')

      cache.get('a') // a becomes most recent
      cache.get('b') // b becomes most recent
      cache.set('d', '4') // should evict c

      expect(cache.has('a')).toBe(true)
      expect(cache.has('b')).toBe(true)
      expect(cache.has('c')).toBe(false)
      expect(cache.has('d')).toBe(true)
    })
  })

  describe('Size-based Eviction', () => {
    it('should use custom size calculation', () => {
      const cache = new LRUCache<string>(10, (value) => value.length)

      cache.set('key1', 'abc') // size 3
      cache.set('key2', 'defgh') // size 5
      cache.set('key3', 'ij') // size 2, total = 10
      cache.set('key4', 'k') // size 1, total = 11, should evict key1

      expect(cache.has('key1')).toBe(false)
      expect(cache.has('key2')).toBe(true)
      expect(cache.has('key3')).toBe(true)
      expect(cache.has('key4')).toBe(true)
      expect(cache.currentSize).toBe(8) // 5 + 2 + 1
    })

    it('should handle items larger than max size', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      const cache = new LRUCache<string>(5, (value) => value.length)

      cache.set('key1', 'toolarge') // size 8 > maxSize 5

      expect(cache.has('key1')).toBe(false)
      expect(cache.size).toBe(0)
      expect(consoleSpy).toHaveBeenCalledWith(
        'Single item size exceeds maxSize'
      )

      consoleSpy.mockRestore()
    })

    it('should update size when overwriting existing keys', () => {
      const cache = new LRUCache<string>(10, (value) => value.length)

      cache.set('key1', 'abc') // size 3
      expect(cache.currentSize).toBe(3)

      cache.set('key1', 'defghij') // size 7
      expect(cache.currentSize).toBe(7)
      expect(cache.size).toBe(1)
    })

    it('should evict multiple items if necessary', () => {
      const cache = new LRUCache<string>(10, (value) => value.length)

      cache.set('key1', 'ab') // size 2
      cache.set('key2', 'cd') // size 2
      cache.set('key3', 'ef') // size 2, total = 6
      cache.set('key4', 'ghijklmno') // size 9, should evict key1, key2, key3

      expect(cache.has('key1')).toBe(false)
      expect(cache.has('key2')).toBe(false)
      expect(cache.has('key3')).toBe(false)
      expect(cache.has('key4')).toBe(true)
      expect(cache.currentSize).toBe(9)
      expect(cache.size).toBe(1)
    })
  })

  describe('Cache Management', () => {
    let cache: LRUCache<string>

    beforeEach(() => {
      cache = new LRUCache<string>(3)
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
    })

    it('should remove specific keys', () => {
      cache.remove('key1')
      expect(cache.has('key1')).toBe(false)
      expect(cache.has('key2')).toBe(true)
      expect(cache.size).toBe(1)
    })

    it('should handle removing non-existent keys', () => {
      cache.remove('nonexistent')
      expect(cache.size).toBe(2)
    })

    it('should track current size correctly after operations', () => {
      const sizeCache = new LRUCache<string>(10, (value) => value.length)

      sizeCache.set('key1', 'abc') // size 3
      sizeCache.set('key2', 'de') // size 2
      expect(sizeCache.currentSize).toBe(5)

      sizeCache.remove('key1')
      expect(sizeCache.currentSize).toBe(2)
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero max size', () => {
      const cache = new LRUCache<string>(0)
      cache.set('key1', 'value1')
      expect(cache.has('key1')).toBe(false)
      expect(cache.size).toBe(0)
    })

    it('should handle single item capacity', () => {
      const cache = new LRUCache<string>(1)

      cache.set('key1', 'value1')
      expect(cache.has('key1')).toBe(true)

      cache.set('key2', 'value2')
      expect(cache.has('key1')).toBe(false)
      expect(cache.has('key2')).toBe(true)
      expect(cache.size).toBe(1)
    })

    it('should work with different value types', () => {
      const numberCache = new LRUCache<number>(2)
      const objectCache = new LRUCache<{ id: number }>(2)

      numberCache.set('num', 42)
      expect(numberCache.get('num')).toBe(42)

      const obj = { id: 1 }
      objectCache.set('obj', obj)
      expect(objectCache.get('obj')).toBe(obj)
    })

    it('should maintain integrity with rapid operations', () => {
      const cache = new LRUCache<number>(100)

      // Rapid insertions
      for (let i = 0; i < 150; i++) {
        cache.set(`key${i}`, i)
      }

      expect(cache.size).toBe(100)
      expect(cache.has('key0')).toBe(false) // early keys evicted
      expect(cache.has('key149')).toBe(true) // recent keys retained
    })
  })
})
