/* eslint-env jest */
import {
  IntervalsManager,
  TimeoutsManager,
} from '../../packages/next/src/server/web/sandbox/resource-managers'

// A fake edge-runtime global object; the managers only use it as the `this`
// value passed to timer callbacks.
const globalObject = {} as any

async function waitFor(condition: () => boolean, timeoutMs = 1000) {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out')
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('web sandbox TimeoutsManager', () => {
  it('releases one-shot timeout ids after they run (regression: #95094)', async () => {
    const manager = new TimeoutsManager()

    let ran = 0
    const increment = () => {
      ran++
    }
    const count = 50
    for (let i = 0; i < count; i++) {
      // Fire-and-forget: the returned id is never passed to clearTimeout,
      // matching common middleware usage.
      manager.add([globalObject, increment, 0])
    }

    // All are tracked before they fire.
    expect(manager.size).toBe(count)

    // After they complete naturally, tracking must drop back to zero even
    // though user code never called clearTimeout.
    await waitFor(() => ran === count)
    await waitFor(() => manager.size === 0)
    expect(manager.size).toBe(0)
  })

  it('does not grow tracked resources across successive fire-and-forget timeouts', async () => {
    const manager = new TimeoutsManager()

    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < 20; i++) {
        manager.add([globalObject, () => {}, 0])
      }
      await waitFor(() => manager.size === 0)
    }

    expect(manager.size).toBe(0)
  })

  it('invokes the callback with the provided extra args and global `this`', async () => {
    const manager = new TimeoutsManager()

    let observedThis: unknown
    const observedArgs: unknown[] = []
    manager.add([
      globalObject,
      function (this: unknown, ...args: unknown[]) {
        observedThis = this
        observedArgs.push(...args)
      },
      0,
      'a',
      'b',
    ])

    await waitFor(() => observedArgs.length > 0)
    expect(observedThis).toBe(globalObject)
    expect(observedArgs).toEqual(['a', 'b'])
    expect(manager.size).toBe(0)
  })

  it('releases the id even when the callback throws', () => {
    jest.useFakeTimers()
    try {
      const manager = new TimeoutsManager()
      const id = manager.add([
        globalObject,
        () => {
          throw new Error('boom')
        },
        0,
      ])
      expect(typeof id).toBe('number')
      expect(manager.size).toBe(1)

      expect(() => jest.runAllTimers()).toThrow('boom')
      expect(manager.size).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it('clearing an already-fired timeout is a no-op', async () => {
    const manager = new TimeoutsManager()

    let ran = false
    const firedId = manager.add([globalObject, () => (ran = true), 0])
    const pendingId = manager.add([globalObject, () => {}, 1000])
    await waitFor(() => ran)
    await waitFor(() => manager.size === 1)

    // Matches user code that calls clearTimeout inside the callback (the
    // documented workaround for #95094); must not throw or affect other
    // tracked timeouts.
    manager.remove(firedId)
    expect(manager.size).toBe(1)

    manager.remove(pendingId)
    expect(manager.size).toBe(0)
  })

  it('remove() cancels a pending timeout and stops tracking it', async () => {
    const manager = new TimeoutsManager()

    let ran = false
    const id = manager.add([globalObject, () => (ran = true), 50])
    expect(manager.size).toBe(1)

    manager.remove(id)
    expect(manager.size).toBe(0)

    // Give the original delay time to elapse; the callback must not run.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(ran).toBe(false)
  })

  it('removeAll() clears everything', async () => {
    const manager = new TimeoutsManager()
    manager.add([globalObject, () => {}, 1000])
    manager.add([globalObject, () => {}, 1000])
    expect(manager.size).toBe(2)

    manager.removeAll()
    expect(manager.size).toBe(0)
  })
})

describe('web sandbox IntervalsManager', () => {
  it('keeps tracking intervals until they are explicitly removed', async () => {
    const manager = new IntervalsManager()

    let ticks = 0
    const id = manager.add([globalObject, () => ticks++, 10])
    expect(manager.size).toBe(1)

    // Intervals fire repeatedly, so they must remain tracked (unlike one-shot
    // timeouts) even after several ticks have run.
    await waitFor(() => ticks >= 3)
    expect(manager.size).toBe(1)

    manager.remove(id)
    expect(manager.size).toBe(0)
  })
})
