import { subscribe } from './subscribe'

describe('subscribe', () => {
  function createHarness<T>() {
    let emit: (err: Error | undefined, value: T | undefined) => void = () => {
      throw new Error('native function not started')
    }
    const disposed: unknown[] = []
    const task = { id: Math.random() }
    const iterator = subscribe<T>(
      true,
      async (callback) => {
        emit = callback as (
          err: Error | undefined,
          value: T | undefined
        ) => void
        return task
      },
      (t) => {
        disposed.push(t)
      }
    )
    return {
      iterator,
      disposeCount: () => disposed.length,
      emit: (err: Error | undefined, value: T | undefined) => emit(err, value),
    }
  }

  it('yields emitted values in order', async () => {
    const { iterator, emit } = createHarness<string>()
    const first = iterator.next()
    emit(undefined, 'a')
    expect(await first).toEqual({ value: 'a', done: false })
    const second = iterator.next()
    emit(undefined, 'b')
    expect(await second).toEqual({ value: 'b', done: false })
    await iterator.return!()
  })

  it('disposes the native task when canceled while idle', async () => {
    const { iterator, disposeCount } = createHarness<string>()
    const pending = iterator.next()
    // The generator is suspended at the idle yield, waiting for an emission.
    await iterator.return!()
    expect(disposeCount()).toBe(1)
    expect(await pending).toEqual({ value: undefined, done: true })
    expect(await iterator.next()).toEqual({ value: undefined, done: true })
  })

  it('disposes the native task when canceled while suspended after a yield', async () => {
    const { iterator, emit, disposeCount } = createHarness<string>()
    const first = iterator.next()
    emit(undefined, 'a')
    expect(await first).toEqual({ value: 'a', done: false })
    // The generator is now suspended *after* yielding a value, with no
    // pending idle wait to reject. Canceling must still run its `finally`.
    await iterator.return!()
    expect(disposeCount()).toBe(1)
    expect(await iterator.next()).toEqual({ value: undefined, done: true })
  })

  it('disposes the native task when a for-await consumer breaks', async () => {
    const { iterator, emit, disposeCount } = createHarness<string>()
    const consumed: string[] = []
    const loop = (async () => {
      for await (const value of iterator) {
        consumed.push(value)
        break
      }
    })()
    emit(undefined, 'a')
    await loop
    expect(consumed).toEqual(['a'])
    // Give the iterator teardown a chance to settle.
    await iterator.return!()
    expect(disposeCount()).toBe(1)
  })

  it('drops late native emissions after cancel', async () => {
    const { iterator, emit, disposeCount } = createHarness<string>()
    const first = iterator.next()
    emit(undefined, 'a')
    expect(await first).toEqual({ value: 'a', done: false })
    await iterator.return!()
    // Emissions after cancel must not be delivered or retained.
    emit(undefined, 'late')
    expect(await iterator.next()).toEqual({ value: undefined, done: true })
    expect(disposeCount()).toBe(1)
  })

  it('propagates native errors to the consumer', async () => {
    const { iterator, emit } = createHarness<string>()
    const pending = iterator.next()
    const failure = new Error('native failure')
    emit(failure, undefined)
    await expect(pending).rejects.toThrow('native failure')
    await iterator.return!()
  })
})
