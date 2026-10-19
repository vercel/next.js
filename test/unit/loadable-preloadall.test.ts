import Loadable from '../../packages/next/src/shared/lib/loadable.shared-runtime'

describe('Loadable.preloadAll concurrent SSR handling', () => {
  it('waits for dynamic components to load across concurrent preloadAll calls', async () => {
    let resolve1: (value: any) => void
    const p1 = new Promise((resolve) => {
      resolve1 = resolve
    })

    let resolve2: (value: any) => void
    const p2 = new Promise((resolve) => {
      resolve2 = resolve
    })

    const Comp1 = Loadable({
      loader: () => p1,
      loading: () => null,
    })

    const Comp2 = Loadable({
      loader: () => p2,
      loading: () => null,
    })

    let comp1Done = false
    let comp2Done = false

    p1.then(() => {
      comp1Done = true
    })
    p2.then(() => {
      comp2Done = true
    })

    let call1Finished = false
    let call2Finished = false
    let call3Finished = false

    // Request 1 triggers preloadAll
    const preloadPromise1 = Loadable.preloadAll().then(() => {
      call1Finished = true
    })

    // Concurrent Request 2 and Request 3 trigger preloadAll while loaders are still pending
    const preloadPromise2 = Loadable.preloadAll().then(() => {
      call2Finished = true
    })

    const preloadPromise3 = Loadable.preloadAll().then(() => {
      call3Finished = true
    })

    // Wait a tick to ensure synchronous promises/microtasks have processed
    await new Promise((r) => setTimeout(r, 10))

    // Neither request should have finished yet because loaders are still pending
    expect(call1Finished).toBe(false)
    expect(call2Finished).toBe(false)
    expect(call3Finished).toBe(false)
    expect(comp1Done).toBe(false)
    expect(comp2Done).toBe(false)

    // Resolve first loader
    resolve1!({ default: () => 'Comp1' })
    await new Promise((r) => setTimeout(r, 10))

    // Still should not finish because Comp2 is still pending
    expect(call1Finished).toBe(false)
    expect(call2Finished).toBe(false)
    expect(call3Finished).toBe(false)

    // Resolve second loader
    resolve2!({ default: () => 'Comp2' })

    await Promise.all([preloadPromise1, preloadPromise2, preloadPromise3])

    // All requests should now be finished and loaders resolved
    expect(call1Finished).toBe(true)
    expect(call2Finished).toBe(true)
    expect(call3Finished).toBe(true)
    expect(comp1Done).toBe(true)
    expect(comp2Done).toBe(true)
  })

  it('handles errors in loaders and resets preloadAllPromise for subsequent calls', async () => {
    const errorLoader = Loadable({
      loader: () => Promise.reject(new Error('ChunkLoadError')),
      loading: () => null,
    })

    let caught1: any = null
    let caught2: any = null

    const p1 = Loadable.preloadAll().catch((err) => {
      caught1 = err
    })
    const p2 = Loadable.preloadAll().catch((err) => {
      caught2 = err
    })

    await Promise.all([p1, p2])

    expect(caught1).toBeInstanceOf(Error)
    expect(caught1.message).toBe('ChunkLoadError')
    expect(caught2).toBeInstanceOf(Error)
    expect(caught2.message).toBe('ChunkLoadError')

    // Subsequent call with new component should work normally
    const successLoader = Loadable({
      loader: () => Promise.resolve({ default: () => 'Success' }),
      loading: () => null,
    })

    await expect(Loadable.preloadAll()).resolves.toBeUndefined()
  })

  it('flushes newly registered initializers while preloading is in flight', async () => {
    let resolve1: (value: any) => void
    const p1 = new Promise((resolve) => {
      resolve1 = resolve
    })

    Loadable({
      loader: () => p1,
      loading: () => null,
    })

    let call1Finished = false
    const preloadPromise = Loadable.preloadAll().then(() => {
      call1Finished = true
    })

    // Register a new loadable component while first preload is in flight
    let resolve2: (value: any) => void
    const p2 = new Promise((resolve) => {
      resolve2 = resolve
    })

    Loadable({
      loader: () => p2,
      loading: () => null,
    })

    await new Promise((r) => setTimeout(r, 10))
    expect(call1Finished).toBe(false)

    // Resolve first loader; preloadAll should not finish yet because second was registered
    resolve1!({ default: () => 'Comp1' })
    await new Promise((r) => setTimeout(r, 10))
    expect(call1Finished).toBe(false)

    // Resolve second loader
    resolve2!({ default: () => 'Comp2' })
    await preloadPromise
    expect(call1Finished).toBe(true)
  })
})
