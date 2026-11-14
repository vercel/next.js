function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const Stub = () => null

describe('Loadable.preloadAll', () => {
  let Loadable: typeof import('./loadable.shared-runtime').default

  beforeEach(() => {
    jest.resetModules()
    Loadable = (
      require('./loadable.shared-runtime') as typeof import('./loadable.shared-runtime')
    ).default
  })

  it('resolves when there is nothing to load', async () => {
    await expect(Loadable.preloadAll()).resolves.toBeUndefined()
  })

  it('waits for loaders flushed by a concurrent call', async () => {
    const loaded = createDeferred<{ default: typeof Stub }>()
    Loadable({ loader: () => loaded.promise, loading: Stub })

    const first = Loadable.preloadAll()
    let isSecondSettled = false
    const second = Loadable.preloadAll().then(() => {
      isSecondSettled = true
    })

    await new Promise((resolve) => setImmediate(resolve))
    expect(isSecondSettled).toBe(false)

    loaded.resolve({ default: Stub })
    await Promise.all([first, second])
    expect(isSecondSettled).toBe(true)
  })

  it('rejects only the call that flushed a failing loader', async () => {
    const failed = createDeferred<{ default: typeof Stub }>()
    Loadable({ loader: () => failed.promise, loading: Stub })

    const first = Loadable.preloadAll()
    const second = Loadable.preloadAll()

    failed.reject(new Error('load failed'))
    await expect(first).rejects.toThrow('load failed')
    await expect(second).resolves.toBeUndefined()
  })
})
