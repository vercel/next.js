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
      const workFn = jest.fn(({ key }) => Promise.resolve(key))

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

  describe('batch with a signal', () => {
    function deferredWork() {
      let resolve!: (value: number) => void
      let workSignal: AbortSignal | undefined
      const workFn = jest.fn(({ signal }: { signal?: AbortSignal }) => {
        workSignal = signal
        return new Promise<number>((r) => {
          resolve = r
        })
      })
      return {
        workFn,
        resolve: (v: number) => resolve(v),
        workSignal: () => workSignal,
      }
    }

    it("doesn't abort work while another caller waits on it", async () => {
      const batcher = Batcher.create<string, number>()
      const work = deferredWork()
      const a = new AbortController()
      const b = new AbortController()

      const resultA = batcher.batch('key', work.workFn, a.signal)
      const resultB = batcher.batch('key', work.workFn, b.signal)
      await Promise.resolve()

      a.abort()
      expect(work.workSignal()!.aborted).toBe(false)

      // The aborted caller still gets the result
      work.resolve(42)
      await expect(resultA).resolves.toBe(42)
      await expect(resultB).resolves.toBe(42)
      expect(work.workFn).toHaveBeenCalledTimes(1)
    })

    it('starts new work for later callers once every caller aborts', async () => {
      const batcher = Batcher.create<string, number>()
      const first = deferredWork()
      const a = new AbortController()
      const b = new AbortController()

      const resultA = batcher.batch('key', first.workFn, a.signal)
      const resultB = batcher.batch('key', first.workFn, b.signal)
      await Promise.resolve()
      a.abort()
      b.abort(new Error('b left'))
      expect(first.workSignal()!.aborted).toBe(true)
      expect(first.workSignal()!.reason).toEqual(new Error('b left'))

      // The aborted work hasn't settled yet, but isn't joined
      const second = deferredWork()
      const resultC = batcher.batch('key', second.workFn)
      await Promise.resolve()
      expect(second.workFn).toHaveBeenCalledTimes(1)
      expect(second.workSignal()).toBeUndefined()

      // Work that ignores the abort still passes its result through, and
      // settling it doesn't remove the new work
      first.resolve(1)
      await expect(resultA).resolves.toBe(1)
      await expect(resultB).resolves.toBe(1)
      const resultD = batcher.batch('key', second.workFn)
      await Promise.resolve()
      expect(second.workFn).toHaveBeenCalledTimes(1)

      second.resolve(2)
      await expect(resultC).resolves.toBe(2)
      await expect(resultD).resolves.toBe(2)
    })

    it("doesn't abort work that a caller without a signal joined", async () => {
      const batcher = Batcher.create<string, number>()
      const work = deferredWork()
      const a = new AbortController()

      const resultA = batcher.batch('key', work.workFn, a.signal)
      const resultB = batcher.batch('key', work.workFn)
      await Promise.resolve()
      a.abort()
      expect(work.workSignal()!.aborted).toBe(false)

      work.resolve(42)
      await expect(resultA).resolves.toBe(42)
      await expect(resultB).resolves.toBe(42)
    })

    it("doesn't run work that every caller aborted before it was scheduled", async () => {
      const scheduled: Array<() => void> = []
      const batcher = Batcher.create<string, number>({
        schedulerFn: (fn) => {
          scheduled.push(fn)
        },
      })
      const workFn = jest.fn().mockResolvedValue(42)
      const a = new AbortController()
      const reason = new Error('left before scheduling')

      const result = batcher.batch('key', workFn, a.signal)
      await Promise.resolve()
      a.abort(reason)
      scheduled.forEach((fn) => fn())

      await expect(result).rejects.toBe(reason)
      expect(workFn).not.toHaveBeenCalled()
    })
  })
})
