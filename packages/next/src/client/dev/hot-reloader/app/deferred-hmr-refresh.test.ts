function loadModule(): typeof import('./deferred-hmr-refresh') {
  let mod!: typeof import('./deferred-hmr-refresh')
  jest.isolateModules(() => {
    mod =
      require('./deferred-hmr-refresh') as typeof import('./deferred-hmr-refresh')
  })
  return mod
}

// Stands in for `hmrRefresh`, which throws until the router has initialized.
function createRouter() {
  const router = {
    initialized: false,
    hmrRefresh: jest.fn(() => {
      if (!router.initialized) {
        throw new Error(
          'Internal Next.js error: Router action dispatched before initialization.'
        )
      }
    }),
  }
  return router
}

describe('deferred HMR refresh', () => {
  it('defers a refresh requested before the router mounts', () => {
    const { requestHmrRefresh, onAppRouterMounted } = loadModule()
    const router = createRouter()

    // Calling it directly loses the refresh.
    expect(() => router.hmrRefresh()).toThrow(/before initialization/)
    router.hmrRefresh.mockClear()

    expect(() => requestHmrRefresh(router.hmrRefresh)).not.toThrow()
    expect(router.hmrRefresh).not.toHaveBeenCalled()

    router.initialized = true
    onAppRouterMounted()
    expect(router.hmrRefresh).toHaveBeenCalledTimes(1)
    expect(router.hmrRefresh).toHaveReturned()
  })

  it('coalesces multiple early refreshes into one', () => {
    const { requestHmrRefresh, onAppRouterMounted } = loadModule()
    const refresh = jest.fn()

    requestHmrRefresh(refresh)
    requestHmrRefresh(refresh)
    requestHmrRefresh(refresh)
    onAppRouterMounted()

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes immediately once the router has mounted', () => {
    const { requestHmrRefresh, onAppRouterMounted } = loadModule()
    const refresh = jest.fn()

    onAppRouterMounted()
    requestHmrRefresh(refresh)
    expect(refresh).toHaveBeenCalledTimes(1)

    requestHmrRefresh(refresh)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('does not run a deferred refresh again when mounted twice', () => {
    // React strict mode runs mount effects twice in development.
    const { requestHmrRefresh, onAppRouterMounted } = loadModule()
    const refresh = jest.fn()

    requestHmrRefresh(refresh)
    onAppRouterMounted()
    onAppRouterMounted()

    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
