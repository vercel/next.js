const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const [mode, consolePath, runtimePath] = process.argv.slice(2)
const { installClientConsole } = require(consolePath)
const requireRuntime = createRequire(runtimePath)
const { clientConsoleBoundary } = requireRuntime('./protocol')
const methods = ['log', 'info', 'debug', 'warn', 'error']
function makeConsole() {
  const native = []
  const target = Object.fromEntries(
    methods.map((method) => [
      method,
      function (...args) {
        assert.equal(this, target)
        native.push({ method, args })
      },
    ])
  )
  return { target, native, originals: { ...target } }
}
async function main() {
  if (mode === 'parent-order') return parentConsoleOrder()
  if (mode === 'format') {
    const { target, native, originals } = makeConsole()
    const output = []
    const stop = installClientConsole(target, (stream, text) =>
      output.push({ stream, text })
    )
    target.log('FORMAT_SINGLE plain')
    target.log('FORMAT_MULTI', 'word', 42, true, null, undefined)
    target.log('FORMAT_OBJECT', { name: 'Ada', nested: { active: true } }, [
      'a',
      2,
      { flag: false },
    ])
    target.log('FORMAT_SUBSTITUTIONS %s %d %o', 'name', 7, { n: 1 })
    target.log('FORMAT_ERROR_VALUE', new Error('displayed error'))
    target.warn('FORMAT_WARN', { code: 7 }, ['x', 2])
    target.error('FORMAT_ERROR', new Error('console error'), { ok: false })
    assert.deepEqual(output, require('./console-format-pristine.json'))
    const held = target.log
    const heldDebug = target.debug
    for (const boundary of Object.values(clientConsoleBoundary))
      target.debug(boundary)
    assert.deepEqual(
      native.slice(-6).map((row) => row.args[0]),
      Object.values(clientConsoleBoundary).flatMap((value) => [
        clientConsoleBoundary.escape,
        value,
      ])
    )
    stop()
    stop()
    assert.deepEqual(target, originals)
    held('retained after stop')
    heldDebug(clientConsoleBoundary.stop)
    assert.equal(output.length, 10)
    assert.equal(native.at(-1).args[0], clientConsoleBoundary.stop)
    assert.equal(
      native.filter((row) => row.args[0] === 'retained after stop').length,
      1
    )
    const failed = makeConsole()
    const sinkError = new Error('output observer failed')
    const restore = installClientConsole(failed.target, () => {
      throw sinkError
    })
    assert.throws(
      () => failed.target.log('native before observer'),
      (error) => error === sinkError
    )
    restore()
    assert.deepEqual(failed.target, failed.originals)
    assert.equal(failed.native[1].args[0], 'native before observer')
    const brokenStop = makeConsole()
    const stopError = new Error('native stop failed')
    brokenStop.target.debug = function (value) {
      if (value === clientConsoleBoundary.stop) throw stopError
    }
    const realDebug = brokenStop.target.debug
    const restoreBroken = installClientConsole(brokenStop.target, () => {})
    assert.throws(
      restoreBroken,
      (error) =>
        error instanceof AggregateError && error.errors.includes(stopError)
    )
    assert.equal(brokenStop.target.debug, realDebug)
    for (const method of methods.filter((value) => value !== 'debug'))
      assert.equal(brokenStop.target[method], brokenStop.originals[method])
    return {
      output,
      nativeCount: native.length,
      observerFailureRestored: true,
      stopFailureRestored: true,
    }
  }
  const { target, native, originals } = makeConsole()
  const hostConsole = globalThis.console
  const messages = [],
    trace = [],
    listeners = new Map()
  let concurrent = 0,
    maximumConcurrent = 0
  const envMode = ['env', 'env-cold-config', 'env-cold-boolean'].includes(mode)
  const envOrder = []
  let envFactoryCalls = 0
  // Component inputs; the native template supplies its actual import.meta.env.
  const envDefaults = {
    DEV: true,
    PROD: false,
    SSR: false,
    MODE: 'component-mode',
    BASE_URL: '/component-env/',
  }
  const config = {
    version: 1,
    ownerToken: 'unit',
    authorization: 'unit',
    sourceHash: 'a'.repeat(64),
    rpcURL: 'http://unit/rpc',
    runId: 'run',
    entryId: 'entry',
    revision: 'rev',
    filePath: '/case.mjs',
    sourceMaps: [],
    clearMocks: false,
    mockReset: true,
    restoreMocks: true,
    unstubGlobals: true,
    ...(envMode
      ? {
          env: {
            NEXT_ENV_BOOTSTRAP: 'configured-before-load',
            NEXT_ENV_DELETED: 'configured-delete',
          },
          unstubEnvs: true,
        }
      : {}),
    fakeTimers: {
      now: 1234,
      toFake: ['Date', 'setTimeout', 'clearTimeout'],
      loopLimit: 3,
      shouldClearNativeTimers: true,
    },
  }
  const file = {
    collect: async (load) => load(),
    validateBrowserClient: () => [],
    run: async () => {
      if (envMode) envOrder.push('body')
      if (mode === 'env-cold-config' || mode === 'env-cold-boolean') {
        const env = requireRuntime('./env')
        const backend = env.createEnvironmentStubs()
        // No authored env getter has run: bootstrap must have seeded originals.
        if (mode === 'env-cold-config') {
          backend.stub('NEXT_ENV_BOOTSTRAP', 'first-stub')
          backend.stub('NEXT_ENV_BOOTSTRAP', 'second-stub')
          backend.stub('NEXT_ENV_DELETED', undefined)
        } else {
          backend.stub('DEV', false)
          backend.stub('PROD', true)
          backend.stub('SSR', undefined)
        }
        const actual = env.getBrowserEnv(envDefaults)
        if (mode === 'env-cold-config') {
          assert.equal(actual.NEXT_ENV_BOOTSTRAP, 'second-stub')
          assert.equal(Object.hasOwn(actual, 'NEXT_ENV_DELETED'), false)
        } else {
          assert.equal(actual.DEV, '')
          assert.equal(actual.PROD, '1')
          assert.equal(Object.hasOwn(actual, 'SSR'), false)
        }
        backend.restore()
        assert.equal(actual.NEXT_ENV_BOOTSTRAP, 'configured-before-load')
        assert.equal(actual.NEXT_ENV_DELETED, 'configured-delete')
        for (const name of ['DEV', 'PROD', 'SSR']) {
          assert.equal(actual[name], envDefaults[name])
          assert.equal(typeof actual[name], 'boolean')
        }
        assert.equal(actual.MODE, envDefaults.MODE)
        assert.equal(actual.BASE_URL, envDefaults.BASE_URL)
        assert.equal(env.getBrowserEnv(envDefaults), actual)
      }
      console.warn('body')
      return {
        cases: [
          {
            entryId: 'entry',
            caseId: 'entry/0',
            name: 'body',
            status: 'passed',
            durationMs: 0,
            errors: [],
            attempt: { id: 'run/entry/0/0/0', retry: 0, repeat: 0 },
          },
        ],
        errors: [],
        interrupted: false,
      }
    },
    dispose: () => {
      console.error('file cleanup')
      trace.push('file')
    },
    getSnapshotSummary: () => ({}),
    takeSnapshotUpdates: () => [],
  }
  function replace(name, exports) {
    const filename = requireRuntime.resolve(name)
    require.cache[filename] = { id: filename, filename, loaded: true, exports }
  }
  replace('../runner', {
    initializeTestFile: (options) => {
      if (envMode) {
        assert.equal(envFactoryCalls, 1)
        envOrder.push('initialize')
      }
      assert.equal(options.fakeTimers, config.fakeTimers)
      for (const key of [
        'clearMocks',
        'mockReset',
        'restoreMocks',
        'unstubGlobals',
        'unstubEnvs',
      ])
        assert.equal(options[key], config[key])
      return file
    },
  })
  replace('./snapshot-environment', { installBrowserSnapshotBridge() {} })
  replace('./source-maps', {
    createClientSourceMapResolver: () => ({ mapLocation: (value) => value }),
  })
  replace('./browser-context', {
    initializeBrowserContext: () => ({
      install() {},
      dispose() {
        trace.push('context')
      },
    }),
    cleanupBrowserContext: () => {
      console.log('browser cleanup')
      trace.push('browser')
    },
  })
  globalThis.console = target
  globalThis.location = { href: 'http://unit/' }
  globalThis.addEventListener = (type, listener) =>
    listeners.set(type, listener)
  globalThis.fetch = async (url, options) => {
    if (!options?.method) return { ok: true, json: async () => config }
    const payload = JSON.parse(options.body)
    messages.push(payload)
    maximumConcurrent = Math.max(maximumConcurrent, ++concurrent)
    await new Promise((resolve) => setImmediate(resolve))
    concurrent--
    return {
      ok: !(mode === 'send-error' && payload.type === 'output'),
      json: async () => ({ value: null }),
    }
  }
  let failure
  try {
    await require(runtimePath).startClientTest(
      () => {
        if (envMode) envOrder.push('load')
        if (mode === 'env') {
          const actual = requireRuntime('./env').getBrowserEnv(envDefaults)
          assert.equal(actual.NEXT_ENV_BOOTSTRAP, 'configured-before-load')
          assert.equal(actual.DEV, true)
        }
        console.log('collection')
      },
      {
        initialize: () => ({
          dispose() {
            console.info('mock cleanup')
            trace.push('mocks')
          },
        }),
        register() {},
      },
      undefined,
      envMode
        ? () => {
            envFactoryCalls++
            envOrder.push('factory')
            return envDefaults
          }
        : undefined
    )
  } catch (error) {
    failure = error
  } finally {
    globalThis.console = hostConsole
  }
  assert.deepEqual(target, originals)
  assert.deepEqual(trace, ['browser', 'file', 'mocks', 'context'])
  assert.equal(native.at(-1).args[0], clientConsoleBoundary.stop)
  assert.equal(maximumConcurrent, 1)
  if (envMode) {
    assert.equal(envFactoryCalls, 1)
    assert.deepEqual(envOrder, ['factory', 'initialize', 'load', 'body'])
  }
  if (mode === 'send-error') {
    assert.match(failure.message, /Browser Mode RPC failed/)
    assert.equal(messages.at(-1).type, 'output')
  } else {
    assert.equal(failure, undefined)
    assert.deepEqual(
      messages
        .filter((row) => row.type === 'output')
        .map((row) => [row.stream, row.text]),
      [
        ['stdout', 'collection\n'],
        ['stderr', 'body\n'],
        ['stdout', 'browser cleanup\n'],
        ['stderr', 'file cleanup\n'],
        ['stdout', 'mock cleanup\n'],
      ]
    )
    assert.equal(messages.at(-1).type, 'complete')
    assert.deepEqual(
      messages.map((row) => row.sequence),
      messages.map((_, index) => index)
    )
    assert.equal(messages.at(-1).status, 'passed')
  }
  return {
    mode,
    messages,
    trace,
    maximumConcurrent,
    ...(envMode ? { envFactoryCalls, envOrder } : {}),
    restored: true,
    failure: failure?.message,
  }
}
main()
  .then((value) => process.stdout.write(JSON.stringify(value) + '\n'))
  .catch((error) => {
    process.stderr.write(error.stack + '\n')
    process.exitCode = 1
  })

async function parentConsoleOrder() {
  const { EventEmitter } = require('node:events')
  const executePath = requireRuntime.resolve('./execute')
  const scenarios = []
  for (const scenario of ['normal', 'observer-error', 'context-error']) {
    const trace = [],
      events = [],
      failures = []
    const observerError = new Error('controlled native output sink failure')
    const contextError = new Error('controlled Browser context close failure')
    const page = new EventEmitter()
    const emit = (type, text) =>
      page.emit('console', { type: () => type, text: () => text })
    let onMessage
    let complete
    const completion = new Promise((resolve) => {
      complete = resolve
    })
    page.goto = async () => {
      emit('log', 'prestart')
      emit('debug', clientConsoleBoundary.start)
      emit('trace', 'active fallback')
      emit('debug', clientConsoleBoundary.stop)
      emit('log', 'late native settlement')
      await Promise.resolve()
      onMessage({
        type: 'output',
        stream: 'stdout',
        text: 'queued earlier RPC\n',
      })
      complete({})
    }
    const context = {
      newPage: async () => page,
      close: async () => {
        trace.push('context-close')
        emit('log', 'queued context-close output')
        page.emit('close')
        if (scenario === 'context-error') throw contextError
      },
    }
    const browser = {
      newContext: async () => context,
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
    const brand = {
      start: async () => {},
      fact: () => ({}),
      close() {},
      afterOwnersClosed: async () => {},
    }
    const replace = (name, exports) => {
      const filename = requireRuntime.resolve(name)
      require.cache[filename] = {
        id: filename,
        filename,
        loaded: true,
        exports,
      }
    }
    replace('../browser/host', {
      createBrowserHost: async () => host,
      connectBrowserHost: async () => browser,
    })
    replace('./server', {
      createClientServer: async (options) => {
        onMessage = options.onMessage
        return server
      },
    })
    replace('./results', { createClientResultCollector: () => collector })
    replace('./engine-brand', { createClientEngineBrand: () => brand })
    delete require.cache[executePath]
    const profile = {
      id: 'console-order',
      environment: 'browser',
      mode: 'development',
      runtime: 'nodejs',
      bundler: 'turbopack',
      browserClient: true,
    }
    const entry = { id: 'entry', file: '/project/console.test.mjs', profile }
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
    let result, failure
    try {
      result = await require(executePath).executeClient(artifact, {
        entry,
        runId: 'run',
        projectDir: '/project',
        setupFiles: [],
        signal: new AbortController().signal,
        updateSnapshots: false,
        testTimeout: 1000,
        hookTimeout: 1000,
        fileTimeout: 5000,
        onEvent(event) {
          if (event.type === 'output') {
            trace.push('output:' + event.text.trimEnd())
            if (
              scenario === 'observer-error' &&
              event.text === 'late native settlement\n'
            )
              throw observerError
          }
          events.push(event)
        },
      })
    } catch (error) {
      failure = error
    }
    const output = events
      .filter((event) => event.type === 'output')
      .map((event) => [event.stream, event.text])
    const observed = {
      scenario,
      output,
      trace,
      status: result?.status,
      failure: failure?.message,
      cleanupComplete: page.listenerCount('console') === 0,
    }
    scenarios.push(observed)
    assert.deepEqual(trace, [
      'output:prestart',
      'output:active fallback',
      'output:queued earlier RPC',
      'context-close',
      'browser-close',
      'host-close',
      'server-close',
      'output:late native settlement',
      'output:queued context-close output',
    ])
    assert.deepEqual(output, [
      ['stdout', 'prestart\n'],
      ['stderr', 'active fallback\n'],
      ['stdout', 'queued earlier RPC\n'],
      ...(scenario === 'observer-error'
        ? []
        : [['stdout', 'late native settlement\n']]),
      ['stdout', 'queued context-close output\n'],
    ])
    assert.equal(observed.cleanupComplete, true)
    if (scenario === 'context-error') {
      assert.ok(failure instanceof AggregateError)
      assert.deepEqual(failure.errors, [contextError])
    } else {
      assert.equal(failure, undefined)
      assert.equal(result.status, scenario === 'normal' ? 'passed' : 'failed')
      assert.deepEqual(failures, scenario === 'normal' ? [] : [observerError])
    }
  }
  return { mode, scenarios }
}
