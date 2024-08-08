import { Batcher } from './batcher'

describe('Batcher', () => {
  describe('batch', () => {
    it('should execute the work function immediately', async () => {
      const batcher = Batcher.create<string, number>()
      const workFn = jest.fn().mockResolvedValue(42)

      const result = await batcher.batch('key', workFn)

      expect(result).toBe(42)
      expect(workFn).toHaveBeenCalledTimes(1)
    })

    it('should batch multiple calls to the same key', async () => {
      const batcher = Batcher.create<string, number>()
      const workFn = jest.fn().mockResolvedValue(42)

      const result1 = batcher.batch('key', workFn)
      const result2 = batcher.batch('key', workFn)

      expect(result1).toBeInstanceOf(Promise)
      expect(result2).toBeInstanceOf(Promise)
      expect(workFn).toHaveBeenCalledTimes(1)

      const [value1, value2] = await Promise.all([result1, result2])

      expect(value1).toBe(42)
      expect(value2).toBe(42)
      expect(workFn).toHaveBeenCalledTimes(1)
    })

    it('should not batch calls to different keys', async () => {
      const batcher = Batcher.create<string, string>()
      const workFn = jest.fn((key) => key)

      const result1 = batcher.batch('key1', workFn)
      const result2 = batcher.batch('key2', workFn)

      expect(result1).toBeInstanceOf(Promise)
      expect(result2).toBeInstanceOf(Promise)
      expect(workFn).toHaveBeenCalledTimes(2)

      const [value1, value2] = await Promise.all([result1, result2])

      expect(value1).toBe('key1')
      expect(value2).toBe('key2')
      expect(workFn).toHaveBeenCalledTimes(2)
    })

    it('should use the cacheKeyFn to generate cache keys', async () => {
      const cacheKeyFn = jest.fn().mockResolvedValue('cache-key')
      const batcher = Batcher.create<string, number>({ cacheKeyFn })
      const workFn = jest.fn().mockResolvedValue(42)

      const result = await batcher.batch('key', workFn)

      expect(result).toBe(42)
      expect(cacheKeyFn).toHaveBeenCalledWith('key')
      expect(workFn).toHaveBeenCalledTimes(1)
    })

    it('should use the schedulerFn to schedule work', async () => {
      const schedulerFn = jest.fn().mockImplementation((fn) => fn())
      const batcher = Batcher.create<string, number>({ schedulerFn })
      const workFn = jest.fn().mockResolvedValue(42)

      const results = await Promise.all([
        batcher.batch('key', workFn),
        batcher.batch('key', workFn),
        batcher.batch('key', workFn),
      ])

      expect(results).toEqual([42, 42, 42])
      expect(workFn).toHaveBeenCalledTimes(1)
    })
  })
})
