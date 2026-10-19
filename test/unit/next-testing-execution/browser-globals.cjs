const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { mkdtemp, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const [
  mode,
  runnerPath,
  commonPath,
  browserPlatformPath,
  browserPath,
  executePath,
  runtimePath,
] = process.argv.slice(2)
const names = [
  'suite',
  'test',
  'describe',
  'it',
  'chai',
  'expect',
  'assert',
  'expectTypeOf',
  'assertType',
  'vi',
  'vitest',
  'beforeAll',
  'afterAll',
  'beforeEach',
  'afterEach',
  'onTestFailed',
  'onTestFinished',
  'aroundEach',
  'aroundAll',
]

async function nodeGlobals() {
  const runner = require(runnerPath)
  const common = require(commonPath)
  const directory = await mkdtemp(join(tmpdir(), 'next-globals-'))
  const original = new Map(
    names.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ])
  )
  const priorTest = () => 'previous test'
  const priorChai = { previous: true }
  Object.defineProperty(globalThis, 'test', {
    get: () => priorTest,
    configurable: true,
    enumerable: false,
  })
  Object.defineProperty(globalThis, 'chai', {
    value: priorChai,
    configurable: true,
    enumerable: false,
    writable: false,
  })
  const before = new Map(
    names.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ])
  )
  const trace = []
  const file = runner.initializeTestFile({
    fileId: 'globals',
    filePath: join(directory, 'globals.test.mjs'),
    globals: true,
  })
  let observed
  try {
    await file.collect(() => {
      for (const name of names) {
        assert.equal(globalThis[name], common[name], name)
        assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, name), {
          value: common[name],
          configurable: true,
          enumerable: true,
          writable: true,
        })
      }
      beforeAll(() => {
        trace.push('beforeAll')
      })
      afterAll(() => {
        trace.push('afterAll')
      })
      test('ordinary global APIs use the actual file', () => {
        trace.push('test')
        const mock = vi.fn((value) => value * 2)
        expect(mock(3)).toBe(6)
        chai.assert.equal(42, 42)
        observed = {
          count: expect.getState().assertionCalls,
          calls: mock.mock.calls,
          chaiAssert: chai.assert === assertGlobal(),
          sameVi: vi === vitest,
          sameTest: test === it,
        }
      })
    })
    const result = await file.run({
      runId: 'globals',
      signal: new AbortController().signal,
      testTimeout: 1000,
      hookTimeout: 1000,
    })
    assert.deepEqual(result.errors, [])
    assert.equal(result.cases.length, 1)
    assert.equal(result.cases[0].status, 'passed')
    await file.dispose()
    for (const name of names)
      assert.deepEqual(
        Object.getOwnPropertyDescriptor(globalThis, name),
        before.get(name),
        name
      )
    assert.equal(globalThis.test, priorTest)
    assert.equal(globalThis.chai, priorChai)
    assert.deepEqual(observed, {
      count: 1,
      calls: [[3]],
      chaiAssert: true,
      sameVi: true,
      sameTest: true,
    })
    assert.deepEqual(trace, ['beforeAll', 'test', 'afterAll'])
    process.stdout.write(
      JSON.stringify({
        mode,
        observed,
        trace,
        restored: true,
        globals: names.length,
      }) + '\n'
    )
  } finally {
    await file.dispose()
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
    await rm(directory, { recursive: true, force: true })
  }
}
function assertGlobal() {
  return globalThis.assert
}

async function browserSelection() {
  const common = require(commonPath)
  const browser = require(browserPath)
  const selected = await require(browserPlatformPath).loadGlobalTestApi()
  for (const name of names) assert.equal(selected[name], browser[name], name)
  assert.notEqual(selected.expect, common.expect)
  assert.notEqual(selected.vi, common.vi)
  const local = createRequire(executePath)
  function replace(name, exports) {
    const filename = local.resolve(name)
    require.cache[filename] = { id: filename, filename, loaded: true, exports }
  }
  const configurations = []
  const stop = new Error('configuration captured')
  replace('./server', {
    createClientServer: async ({ configuration }) => {
      configurations.push(configuration)
      throw stop
    },
  })
  replace('./results', {
    createClientResultCollector: () => ({
      events: [],
      fail() {},
      hasFailure: () => true,
    }),
  })
  const profile = {
    id: 'globals',
    environment: 'browser',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
    browserClient: true,
  }
  const entry = { id: 'globals', file: '/globals.test.mjs', profile }
  const artifact = {
    version: 2,
    kind: 'browser',
    entryId: entry.id,
    revision: 'globals',
    profile,
    client: {
      sourceFile: entry.file,
      asyncScope: 'promise-continuations-v1',
      creatorScope: 'synchronous-source-v1',
      creatorPromiseRoute: 'native-engine-v1',
    },
  }
  for (const globals of [true, false, undefined]) {
    await require(executePath).executeClient(artifact, {
      entry,
      runId: 'globals',
      projectDir: '/',
      setupFiles: [],
      globals,
      signal: new AbortController().signal,
      testTimeout: 1000,
      hookTimeout: 1000,
      fileTimeout: 5000,
      onEvent() {},
    })
    assert.equal(configurations.at(-1).globals, globals)
  }
  const runtimeRequire = createRequire(runtimePath)
  const runtimeReplace = (name, exports) => {
    const filename = runtimeRequire.resolve(name)
    require.cache[filename] = { id: filename, filename, loaded: true, exports }
  }
  let initialized
  const trace = []
  const file = {
    collect: async (load) => load(),
    validateBrowserClient: () => [],
    run: async () => ({ cases: [], errors: [], interrupted: false }),
    dispose: () => trace.push('file'),
    getSnapshotSummary: () => ({}),
    takeSnapshotUpdates: () => [],
  }
  runtimeReplace('../runner', {
    initializeTestFile: (options) => {
      initialized = options
      return file
    },
  })
  runtimeReplace('./snapshot-environment', {
    installBrowserSnapshotBridge() {},
  })
  runtimeReplace('./source-maps', {
    createClientSourceMapResolver: () => ({ mapLocation: (value) => value }),
  })
  runtimeReplace('./browser-context', {
    initializeBrowserContext: () => ({
      install() {},
      dispose: () => trace.push('context'),
    }),
    cleanupBrowserContext: () => trace.push('browser'),
  })
  const config = {
    ...configurations[0],
    version: 1,
    ownerToken: 'globals',
    authorization: 'globals',
    sourceHash: 'a'.repeat(64),
    rpcURL: 'http://unit/rpc',
    runId: 'globals',
    entryId: 'globals',
    revision: 'globals',
    filePath: entry.file,
    sourceMaps: [],
  }
  const messages = []
  const originalConsole = console
  globalThis.location = { href: 'http://unit/' }
  globalThis.addEventListener = () => {}
  globalThis.removeEventListener = () => {}
  globalThis.fetch = async (_url, request) => {
    if (!request?.method) return { ok: true, json: async () => config }
    messages.push(JSON.parse(request.body))
    return { ok: true, json: async () => ({ value: null }) }
  }
  try {
    await require(runtimePath).startClientTest(() => {
      assert.equal(initialized.globals, true)
      trace.push('load')
    })
  } finally {
    globalThis.console = originalConsole
  }
  assert.deepEqual(trace, ['load', 'browser', 'file', 'context'])
  assert.equal(messages.at(-1).type, 'complete')
  assert.equal(messages.at(-1).status, 'passed')
  process.stdout.write(
    JSON.stringify({
      mode,
      globals: names.length,
      browserFacade: true,
      forwarded: configurations.map((row) => row.globals ?? null),
      trace,
    }) + '\n'
  )
}
Promise.resolve()
  .then(() => (mode === 'node' ? nodeGlobals() : browserSelection()))
  .catch((error) => {
    process.stderr.write(error.stack + '\n')
    process.exitCode = 1
  })
