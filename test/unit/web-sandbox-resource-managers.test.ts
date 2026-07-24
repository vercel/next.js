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
    const incrementRan = () => ran++
    const count = 50
    for (let i = 0; i < count; i++) {
      // Fire-and-forget: the returned id is never passed to clearTimeout,
      // matching common middleware usage.
      manager.add([globalObject, incrementRan, 0])
    }

    // All are tracked before they fire.
    expect(manager.size).toBe(count)

    // After they complete naturally, tracking must drop back to zero even
    // though user code never called clearTimeout.
    await waitFor(() => ran === count)
    await waitFor(() => manager.size === 0)
    expect(manager.size).toBe(0)
  })

  it('does not grow across successive fire-and-forget timeout batches', async () => {
    const manager = new TimeoutsManager()

    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < 20; i++) {
        manager.add([globalObject, () => {}, 0])
      }
      await waitFor(() => manager.size === 0)
    }

    expect(manager.size).toBe(0)
  })

  it('preserves callback args and the web global `this` value', async () => {
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

  it('remove() cancels a pending timeout and stops tracking it', async () => {
    const manager = new TimeoutsManager()

    let ran = false
    const id = manager.add([globalObject, () => (ran = true), 50])
    expect(manager.size).toBe(1)

    manager.remove(id)
    expect(manager.size).toBe(0)

    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(ran).toBe(false)
  })

  it('removeAll() clears every pending timeout', () => {
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

    await waitFor(() => ticks >= 3)
    expect(manager.size).toBe(1)

    manager.remove(id)
    expect(manager.size).toBe(0)
  })
})
