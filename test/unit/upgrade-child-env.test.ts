describe('upgrade child env', () => {
  const originalNodeEnv = process.env.NODE_ENV

  function loadChildEnv(): typeof import('next/dist/lib/upgrade/child-env') {
    // The module remembers whether the CLI injected NODE_ENV, so each test
    // starts from a fresh module registry.
    jest.resetModules()
    return require('next/dist/lib/upgrade/child-env')
  }

  afterEach(() => {
    const env = process.env as { NODE_ENV?: string }
    if (originalNodeEnv === undefined) {
      delete env.NODE_ENV
    } else {
      env.NODE_ENV = originalNodeEnv
    }
  })

  it('leaves a NODE_ENV the user exported untouched', () => {
    const env = process.env as { NODE_ENV?: string }
    env.NODE_ENV = 'staging'
    const { injectNodeEnv, getUpgradeChildEnv } = loadChildEnv()

    injectNodeEnv('production')

    expect(process.env.NODE_ENV).toBe('staging')
    expect(getUpgradeChildEnv().NODE_ENV).toBe('staging')
  })

  it('drops a NODE_ENV the CLI injected', () => {
    const env = process.env as { NODE_ENV?: string }
    delete env.NODE_ENV
    const { injectNodeEnv, getUpgradeChildEnv } = loadChildEnv()

    injectNodeEnv('production')

    expect(process.env.NODE_ENV).toBe('production')
    expect(getUpgradeChildEnv().NODE_ENV).toBeUndefined()
  })

  it('drops an injected NODE_ENV after a later command overrides it', () => {
    // `next build --debug-prerender` marks the CLI default as `production` and
    // then switches the process to `development`. The override is still not
    // the user's value, so the child processes must not inherit it.
    const env = process.env as { NODE_ENV?: string }
    delete env.NODE_ENV
    const { injectNodeEnv, getUpgradeChildEnv } = loadChildEnv()

    injectNodeEnv('production')
    env.NODE_ENV = 'development'

    expect(getUpgradeChildEnv().NODE_ENV).toBeUndefined()
  })
})
