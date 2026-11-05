const { createModuleReplacer } = require('./module-fixtures.cjs')

/** Fake the transport around executeClient while keeping native actions in callers. */
module.exports = function createClientTransportFixture({
  executePath,
  page,
  trace,
  failures,
  completion,
  setDispatch,
  getOperation,
  onRegisterSelectors,
  onConnect,
  onNewContext,
  beforePageClose,
  afterPageClose,
}) {
  const context = {
    newPage: async () => page,
    close: async () => {
      trace.push('context-close')
      beforePageClose?.()
      page.emit('close')
      afterPageClose?.()
    },
  }
  const browser = {
    newContext: async () => {
      onNewContext?.()
      return context
    },
    close: async () => {
      trace.push('browser-close')
    },
  }
  const host = {
    wsEndpoint: 'ws://unit',
    dispose: async () => {
      trace.push('host-close')
    },
  }
  const server = {
    url: 'http://unit/',
    completion,
    verify: async () => {},
    assertClean() {},
    mapStack: () => [],
    fail() {},
    dispose: async () => {
      trace.push('server-close')
      await getOperation()?.catch(() => {})
    },
  }
  const collector = {
    events: [],
    accept() {},
    fail(error) {
      failures.push(error)
    },
    hasFailure: () => failures.length > 0,
    result: () => ({
      status: failures.length ? 'failed' : 'passed',
      updates: [],
    }),
  }
  const replace = createModuleReplacer(executePath)
  replace('../browser/host', {
    createBrowserHost: async () => host,
    connectBrowserHost: async (options) => {
      if (onRegisterSelectors)
        await options.beforeConnect({
          selectors: { register: onRegisterSelectors },
        })
      onConnect?.()
      return browser
    },
  })
  replace('./server', {
    createClientServer: async (options) => {
      setDispatch(options.onBrowserCommand)
      return server
    },
  })
  replace('./results', { createClientResultCollector: () => collector })
  replace('./engine-brand', {
    createClientEngineBrand: () => ({
      start: async () => {},
      fact: () => ({}),
      close() {},
      afterOwnersClosed: async () => {},
    }),
  })

  return function execute({
    profileId,
    sourceFile,
    projectDir,
    signal,
    onEvent,
  }) {
    const profile = {
      id: profileId,
      environment: 'browser',
      mode: 'development',
      runtime: 'nodejs',
      bundler: 'turbopack',
      browserClient: true,
    }
    const entry = { id: 'entry', file: sourceFile, profile }
    const artifact = {
      version: 2,
      kind: 'browser',
      entryId: entry.id,
      revision: 'revision',
      profile,
      client: {
        sourceFile: entry.file,
        asyncScope: 'promise-continuations-v1',
        creatorScope: 'synchronous-source-v1',
        creatorPromiseRoute: 'native-engine-v1',
      },
    }
    return require(executePath).executeClient(artifact, {
      entry,
      runId: 'run',
      projectDir,
      setupFiles: [],
      signal,
      updateSnapshots: false,
      testTimeout: 1000,
      hookTimeout: 1000,
      fileTimeout: 5000,
      onEvent,
    })
  }
}
