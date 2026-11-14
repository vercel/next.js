import {
  AsyncLocalStorage,
  createHook,
  executionAsyncId,
  type AsyncHook,
} from 'node:async_hooks'
import { forEachInFreshAsyncContext } from 'next/dist/server/dev/for-each-in-fresh-async-context'

const RESOURCE_TYPE = 'NextSubscriptionIteration'

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

async function* values<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    await tick()
    yield item
  }
}

/** An iterator that records how it's driven. */
function createRecordingIterator<T>(items: T[]) {
  const events: string[] = []
  let index = 0

  const iterator: AsyncIterableIterator<T> = {
    [Symbol.asyncIterator]() {
      return this
    },
    async next() {
      events.push('next')
      await tick()
      if (index < items.length) {
        return { done: false, value: items[index++] }
      }
      return { done: true, value: undefined }
    },
    async return() {
      events.push('return')
      return { done: true, value: undefined }
    },
  }

  return { iterator, events }
}

describe('forEachInFreshAsyncContext', () => {
  it('delivers values in order and waits for the callback before continuing', async () => {
    const { iterator, events } = createRecordingIterator([1, 2, 3])

    await forEachInFreshAsyncContext(iterator, async (value) => {
      events.push(`start ${value}`)
      await tick()
      await tick()
      events.push(`end ${value}`)
    })

    expect(events).toEqual([
      'next',
      'start 1',
      'end 1',
      'next',
      'start 2',
      'end 2',
      'next',
      'start 3',
      'end 3',
      'next',
    ])
  })

  it('supports synchronous callbacks, and returning early acts like continue', async () => {
    const seen: number[] = []

    await forEachInFreshAsyncContext(values([1, 2, 3, 4]), (value) => {
      if (value % 2 === 0) {
        return
      }
      seen.push(value)
    })

    expect(seen).toEqual([1, 3])
  })

  it('resolves for an empty iterable', async () => {
    const callback = jest.fn()
    await forEachInFreshAsyncContext(values([]), callback)
    expect(callback).not.toHaveBeenCalled()
  })

  it('rejects when the iterator rejects, without closing it', async () => {
    const error = new Error('subscription failed')
    const returnFn = jest.fn()
    const iterator: AsyncIterableIterator<number> = {
      [Symbol.asyncIterator]() {
        return this
      },
      next: jest
        .fn()
        .mockResolvedValueOnce({ done: false, value: 1 })
        .mockRejectedValueOnce(error),
      return: returnFn,
    }
    const callback = jest.fn()

    await expect(forEachInFreshAsyncContext(iterator, callback)).rejects.toBe(
      error
    )
    expect(callback).toHaveBeenCalledTimes(1)
    expect(returnFn).not.toHaveBeenCalled()
  })

  it.each([
    [
      'throws',
      (error: Error) => () => {
        throw error
      },
    ],
    [
      'rejects',
      (error: Error) => async () => {
        await tick()
        throw error
      },
    ],
  ])(
    'stops, closes the iterator, and rejects when the callback %s',
    async (_, createCallback) => {
      const error = new Error('callback failed')
      const { iterator, events } = createRecordingIterator([1, 2, 3])
      const callback = jest.fn(createCallback(error))

      await expect(forEachInFreshAsyncContext(iterator, callback)).rejects.toBe(
        error
      )
      expect(callback).toHaveBeenCalledTimes(1)
      expect(events).toEqual(['next', 'return'])
    }
  )

  it("prefers the callback's error over an error from closing the iterator", async () => {
    const error = new Error('callback failed')
    const iterator: AsyncIterableIterator<number> = {
      [Symbol.asyncIterator]() {
        return this
      },
      next: async () => ({ done: false, value: 1 }),
      return: async () => {
        throw new Error('return failed')
      },
    }

    await expect(
      forEachInFreshAsyncContext(iterator, () => {
        throw error
      })
    ).rejects.toBe(error)
  })

  it("prefers the callback's error when closing the iterator throws synchronously", async () => {
    const error = new Error('callback failed')
    const iterator: AsyncIterableIterator<number> = {
      [Symbol.asyncIterator]() {
        return this
      },
      next: async () => ({ done: false, value: 1 }),
      return: () => {
        throw new Error('return failed')
      },
    }

    await expect(
      forEachInFreshAsyncContext(iterator, async () => {
        throw error
      })
    ).rejects.toBe(error)
  })

  it('stops and closes the iterator when the callback returns false (like break)', async () => {
    const { iterator, events } = createRecordingIterator([1, 2, 3])
    const seen: number[] = []

    await forEachInFreshAsyncContext(
      iterator,
      async (value): Promise<false | void> => {
        seen.push(value)
        await tick()
        return value === 2 ? false : undefined
      }
    )

    expect(seen).toEqual([1, 2])
    expect(events).toEqual(['next', 'next', 'return'])
  })

  it('rejects with the error from closing the iterator after a break', async () => {
    const error = new Error('return failed')
    const iterator: AsyncIterableIterator<number> = {
      [Symbol.asyncIterator]() {
        return this
      },
      next: async () => ({ done: false, value: 1 }),
      return: async () => {
        throw error
      },
    }

    await expect(
      forEachInFreshAsyncContext(iterator, () => false)
    ).rejects.toBe(error)
  })

  it('resolves after a break when the iterator has no return method', async () => {
    let index = 0
    const iterable: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: false, value: ++index }),
      }),
    }

    await forEachInFreshAsyncContext(iterable, (value) =>
      value === 3 ? false : undefined
    )
    expect(index).toBe(3)
  })

  it('rejects when the iterator throws synchronously, without closing it', async () => {
    const error = new Error('next failed')
    const returnFn = jest.fn()
    const iterator: AsyncIterableIterator<number> = {
      [Symbol.asyncIterator]() {
        return this
      },
      next: () => {
        throw error
      },
      return: returnFn,
    }

    await expect(forEachInFreshAsyncContext(iterator, jest.fn())).rejects.toBe(
      error
    )
    expect(returnFn).not.toHaveBeenCalled()
  })

  it('rejects when the iterator returns an invalid result', async () => {
    const iterator = {
      [Symbol.asyncIterator]() {
        return this
      },
      next: async () => null,
    } as unknown as AsyncIterable<number>

    await expect(
      forEachInFreshAsyncContext(iterator, jest.fn())
    ).rejects.toBeInstanceOf(TypeError)
  })

  it('rejects when the iterator cannot be created', async () => {
    const error = new Error('cannot iterate')
    const iterable: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => {
        throw error
      },
    }

    await expect(forEachInFreshAsyncContext(iterable, jest.fn())).rejects.toBe(
      error
    )
  })

  it('propagates AsyncLocalStorage stores into every iteration', async () => {
    const storage = new AsyncLocalStorage<string>()
    const stores: Array<string | undefined> = []

    await storage.run('outer', () =>
      forEachInFreshAsyncContext(values([1, 2, 3]), async () => {
        stores.push(storage.getStore())
        await tick()
        stores.push(storage.getStore())
      })
    )

    expect(stores).toEqual(Array(6).fill('outer'))
  })

  describe('async ancestry', () => {
    let hook: AsyncHook
    // Models how React's async debug info tracking links async resources: a
    // promise is linked to both its trigger and the execution context it was
    // created in, other resources only to their trigger.
    let parents: Map<number, number[]>
    let types: Map<number, string>
    let destroyed: Set<number>

    beforeEach(() => {
      parents = new Map()
      types = new Map()
      destroyed = new Set()
      hook = createHook({
        init(asyncId, type, triggerAsyncId) {
          parents.set(
            asyncId,
            type === 'PROMISE'
              ? [triggerAsyncId, executionAsyncId()]
              : [triggerAsyncId]
          )
          types.set(asyncId, type)
        },
        destroy(asyncId) {
          destroyed.add(asyncId)
        },
      }).enable()
    })

    afterEach(() => {
      hook.disable()
    })

    /** All async IDs that the given async ID is (transitively) linked to. */
    function ancestorsOf(asyncId: number): Set<number> {
      const ancestors = new Set<number>()
      const pending = [...(parents.get(asyncId) ?? [])]
      while (pending.length > 0) {
        const current = pending.pop()!
        if (ancestors.has(current)) {
          continue
        }
        ancestors.add(current)
        pending.push(...(parents.get(current) ?? []))
      }
      return ancestors
    }

    async function collectExecutionAsyncIds(
      loop: (
        iterable: AsyncIterable<number>,
        callback: () => Promise<void>
      ) => Promise<void>
    ) {
      const executionAsyncIds: number[] = []
      await loop(values([1, 2, 3, 4, 5]), async () => {
        await tick()
        executionAsyncIds.push(executionAsyncId())
      })
      return executionAsyncIds
    }

    it('does not link an iteration to the previous one', async () => {
      const executionAsyncIds = await collectExecutionAsyncIds(
        forEachInFreshAsyncContext
      )
      expect(executionAsyncIds).toHaveLength(5)
      // The ancestry doesn't grow with every iteration.
      const sizes = executionAsyncIds.map((id) => ancestorsOf(id).size)
      expect(new Set(sizes).size).toBe(1)

      const isIterationResource = (asyncId: number) =>
        types.get(asyncId) === RESOURCE_TYPE

      for (let i = 1; i < executionAsyncIds.length; i++) {
        const ancestors = ancestorsOf(executionAsyncIds[i])
        expect(ancestors.has(executionAsyncIds[i - 1])).toBe(false)
        // Each iteration descends from exactly one iteration resource: its own.
        expect([...ancestors].filter(isIterationResource)).toHaveLength(1)
      }
    })

    it('grows with every iteration of a `for await` loop (sanity check)', async () => {
      const executionAsyncIds = await collectExecutionAsyncIds(
        async (iterable, callback) => {
          for await (const _ of iterable) {
            await callback()
          }
        }
      )

      const sizes = executionAsyncIds.map((id) => ancestorsOf(id).size)
      for (let i = 1; i < sizes.length; i++) {
        expect(sizes[i]).toBeGreaterThan(sizes[i - 1])
      }
    })

    async function expectAllIterationResourcesDestroyed(count: number) {
      // Destroy hooks are emitted asynchronously.
      await tick()
      await tick()

      const resources = [...types]
        .filter(([, type]) => type === RESOURCE_TYPE)
        .map(([asyncId]) => asyncId)
      expect(resources).toHaveLength(count)
      for (const asyncId of resources) {
        expect(destroyed.has(asyncId)).toBe(true)
      }
    }

    it('destroys every iteration resource', async () => {
      await forEachInFreshAsyncContext(values([1, 2, 3]), async () => {
        await tick()
      })

      // One resource per value, plus one for the final `next()` call.
      await expectAllIterationResourcesDestroyed(4)
    })

    it('destroys every iteration resource after a break', async () => {
      await forEachInFreshAsyncContext(values([1, 2, 3]), (value) =>
        value === 2 ? false : undefined
      )

      await expectAllIterationResourcesDestroyed(2)
    })

    it('destroys every iteration resource when the callback fails', async () => {
      await expect(
        forEachInFreshAsyncContext(values([1, 2, 3]), async (value) => {
          if (value === 2) {
            throw new Error('callback failed')
          }
        })
      ).rejects.toThrow('callback failed')

      await expectAllIterationResourcesDestroyed(2)
    })

    it('destroys every iteration resource when the iterator fails', async () => {
      async function* failing() {
        yield 1
        throw new Error('iterator failed')
      }

      await expect(
        forEachInFreshAsyncContext(failing(), async () => {})
      ).rejects.toThrow('iterator failed')

      await expectAllIterationResourcesDestroyed(2)
    })
  })
})
