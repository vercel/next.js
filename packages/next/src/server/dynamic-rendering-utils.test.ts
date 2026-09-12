import { createPromiseWithResolvers } from '../shared/lib/promise-with-resolvers'
import { trackPromiseUsed } from './dynamic-rendering-utils'

describe('trackPromiseUsed', () => {
  it('`then` is tracked and forwards the value', async () => {
    const underlying = createPromiseWithResolvers<typeof result>()

    const onUse = jest.fn()

    const trackedPromise = trackPromiseUsed(underlying.promise, onUse)
    void trackedPromise.then // accessing the property does not count as a usage
    expect(onUse).toHaveBeenCalledTimes(0)

    const derived = trackedPromise.then((value) => {
      return value
    })
    expect(onUse).toHaveBeenCalledTimes(1)
    expect(derived).toBeInstanceOf(Promise)

    const result = { foo: 'bar' }
    underlying.resolve(result)

    await expect(derived).resolves.toBe(result)
  })

  it('`catch` is tracked and forwards the error', async () => {
    const underlying = createPromiseWithResolvers<never>()

    const onUse = jest.fn()

    const trackedPromise = trackPromiseUsed(underlying.promise, onUse)
    void trackedPromise.catch // accessing the property does not count as a usage
    expect(onUse).toHaveBeenCalledTimes(0)

    const derived = trackedPromise.catch((error) => {
      return error
    })
    expect(onUse).toHaveBeenCalledTimes(1)
    expect(derived).toBeInstanceOf(Promise)

    const error = new Error('kaboom')
    underlying.reject(error)

    // Note: we're catching the error, so it resolves, not rejects
    await expect(derived).resolves.toBe(error)
  })

  it('`finally` is tracked and forwards the value', async () => {
    const underlying = createPromiseWithResolvers<typeof result>()

    const onUse = jest.fn()

    const trackedPromise = trackPromiseUsed(underlying.promise, onUse)
    void trackedPromise.finally // accessing the property does not count as a usage
    expect(onUse).toHaveBeenCalledTimes(0)

    const onFinally = jest.fn()
    const derived = trackedPromise.finally(onFinally)
    expect(onUse).toHaveBeenCalledTimes(1)
    expect(derived).toBeInstanceOf(Promise)

    const result = { foo: 'bar' }
    underlying.resolve(result)

    await expect(derived).resolves.toBe(result)
    expect(onFinally).toHaveBeenCalledTimes(1)
  })

  it('`finally` is tracked and forwards the error', async () => {
    const underlying = createPromiseWithResolvers<never>()

    const onUse = jest.fn()

    const trackedPromise = trackPromiseUsed(underlying.promise, onUse)
    void trackedPromise.finally // accessing the property does not count as a usage
    expect(onUse).toHaveBeenCalledTimes(0)

    const onFinally = jest.fn()
    const derived = trackedPromise.finally(onFinally)
    expect(onUse).toHaveBeenCalledTimes(1)
    expect(derived).toBeInstanceOf(Promise)

    const error = new Error('kaboom')
    underlying.reject(error)

    await expect(derived).rejects.toBe(error)
  })

  it('native `await` is tracked', async () => {
    const underlying = createPromiseWithResolvers<typeof result>()

    const onUse = jest.fn()

    const trackedPromise = trackPromiseUsed(underlying.promise, onUse)
    expect(onUse).toHaveBeenCalledTimes(0)

    const derived = (async () => {
      const result = await trackedPromise
      return result
    })()

    // Flush microtasks
    await new Promise((resolve) =>
      queueMicrotask(() => process.nextTick(resolve))
    )

    expect(onUse).toHaveBeenCalledTimes(1)

    const result = { foo: 'bar' }
    underlying.resolve(result)

    await expect(derived).resolves.toBe(result)
  })
})
