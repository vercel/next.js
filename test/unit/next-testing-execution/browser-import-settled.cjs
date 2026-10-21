const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { mkdtempSync, readFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, dirname, basename, resolve } = require('node:path')
const [mode, runtimePath, browserPath] = process.argv.slice(2)
assert.ok(['normal', 'initialize-error', 'file-dispose-error'].includes(mode))
const local = createRequire(runtimePath)
function replace(name, exports) {
  const filename = local.resolve(name)
  require.cache[filename] = { id: filename, filename, loaded: true, exports }
}
// The component selects the same Browser assertion/clock exports as native code.
// Loader promises and module records below are controlled inputs to the unchanged
// tracker, not a claim that this Node child performs native Browser compilation.
replace(
  '../../../compiled/next-test-primitives',
  local('../../../compiled/next-test-primitives/browser')
)
replace('../assertions/fake-timers', local('./fake-timers'))
const client = local('./async-context')
replace('../assertions/assertion-platform', local('./assertion-platform'))
const snapshots = local('./snapshot-environment')
replace('../assertions/snapshot-environment', snapshots)
const { createAssertionRuntime } = local('../assertions')
const originalRunner = local('../runner')
const { createModuleImportTracker } = local('../runner/imports')
const realSetTimeout = globalThis.setTimeout.bind(globalThis)
const originalDate = Date
const originalTimeout = setTimeout
const originalConsole = console
const nativeConsoleCalls = []
const consoleMethods = ['log', 'info', 'debug', 'warn', 'error']
const controlledConsole = Object.fromEntries(
  consoleMethods.map((method) => [
    method,
    function (...args) {
      assert.equal(this, controlledConsole)
      nativeConsoleCalls.push({ method, args })
    },
  ])
)
const originalConsoleMethods = { ...controlledConsole }
const messages = [],
  trace = [],
  late = [],
  observations = []
const directory = mkdtempSync(join(tmpdir(), 'next-browser-import-settled-'))
const filePath = join(directory, 'contract.case.mjs')
const initializationError = new Error(
  'controlled import file initialization failure'
)
const fileDisposeError = new Error('controlled import file disposal failure')
const prototype = {
  l(value) {
    return value
  },
  L(value) {
    return value
  },
}
const originalLoad = prototype.l
const originalURLLoad = prototype.L
const context = Object.assign(Object.create(prototype), { c: new Map() })
let tracker, assertions, retained, pendingOutcome, collection, collectionHandle
let initializedOptions
const makeScope = (kind, id) => {
  const context = {
    id,
    fileId: 'entry',
    name: id,
    ...(kind === 'attempt' ? { testId: 'entry/0' } : {}),
  }
  const boundary = client.createAsyncScope({ kind, context }, (error) =>
    late.push(error)
  )
  const token = boundary.run(() => client.captureCreatorScope())
  return { context, boundary, token }
}
const frame = async (scope, callback) => {
  const leave = client.enterCreatorScope(scope.token)
  try {
    return await scope.boundary.run(callback)
  } finally {
    leave()
  }
}
const finish = async (scope, handle) => {
  await frame(scope, async () => {
    if (scope.context.testId) await handle.finishTest(false)
    await handle.finalize()
    await handle.dispose()
  })
  scope.boundary.close()
}
const file = {
  async collect(load) {
    collection = makeScope('collection', 'entry')
    assertions = await collection.boundary.run(() =>
      createAssertionRuntime({
        testPath: filePath,
        resourceLifetime: 'file',
        waitForImports: initializedOptions.waitForImports,
        getCurrentAttempt: client.getOriginatingAttempt,
        getCurrentHook: client.getOriginatingHook,
        getCurrentCollection: client.getOriginatingCollection,
        getCurrentScopeAncestors: client.getOriginatingScopeAncestors,
      })
    )
    collectionHandle = collection.boundary.run(() =>
      assertions.beginCollection(collection.context)
    )
    collection.boundary.run(load)
    await finish(collection, collectionHandle)
    collectionHandle = undefined
  },
  validateBrowserClient() {
    return []
  },
  async run() {
    const scope = makeScope('attempt', 'run/entry/0/0/0')
    const handle = scope.boundary.run(() =>
      assertions.beginAttempt(scope.context)
    )
    await frame(scope, async () => {
      const { vi } = local(browserPath)
      retained = vi.dynamicImportSettled
      assert.equal(retained, vi.dynamicImportSettled)
      vi.useFakeTimers({ now: 2000 })
      try {
        const events = []
        const first = new Promise((resolve) =>
          realSetTimeout(() => {
            events.push('first')
            const second = new Promise((resolve) =>
              realSetTimeout(() => {
                events.push('second')
                resolve()
              }, 0)
            )
            const exported = context.L(second)
            const getter = () => exported
            context.c.set(
              'async-second',
              Object.defineProperties(
                {},
                { exports: { get: getter }, namespaceObject: { get: getter } }
              )
            )
            resolve()
          }, 0)
        )
        assert.equal(context.l(first), first)
        const returned = await retained()
        assert.equal(returned, undefined)
        assert.deepEqual(events, ['first', 'second'])
        assert.equal(Date.now(), 2000)
        assert.equal(vi.getTimerCount(), 0)
        observations.push({
          name: 'nested',
          events,
          returnedUndefined: returned === undefined,
          fakeNow: Date.now(),
        })
        const failure = new Error('caught import load failure')
        const rejected = Promise.reject(failure)
        assert.equal(context.L(rejected), rejected)
        const caught = rejected.catch((error) => error)
        assert.equal(await vi.dynamicImportSettled(), undefined)
        assert.equal(await caught, failure)
        // A plain CommonJS Promise export is not a pending async-module getter.
        context.c.set('commonjs-promise', { exports: new Promise(() => {}) })
        assert.equal(await vi.dynamicImportSettled(), undefined)
        observations.push({
          name: 'rejected-and-commonjs',
          sameFailure: true,
          settled: true,
        })
      } finally {
        vi.useRealTimers()
      }
      // Start real pending work while the actual scope is active; file cleanup
      // must cancel it independently instead of draining a never-resolving load.
      context.l(new Promise(() => {}))
      pendingOutcome = retained().then(
        () => ({ resolved: true }),
        (error) => ({ message: error.message })
      )
    })
    await finish(scope, handle)
    return {
      cases: [
        {
          entryId: 'entry',
          caseId: 'entry/0',
          name: 'imports',
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
  async dispose() {
    trace.push('file-dispose')
    await assertions?.finishFile()
    if (mode === 'file-dispose-error') throw fileDisposeError
  },
  getSnapshotSummary() {
    return {}
  },
  takeSnapshotUpdates() {
    return []
  },
}
replace('../runner', {
  ...originalRunner,
  initializeTestFile(options) {
    trace.push('initialize-file')
    initializedOptions = options
    assert.equal(typeof options.waitForImports, 'function')
    assert.equal(options.waitForImports, tracker.waitForImports)
    if (mode === 'initialize-error') throw initializationError
    return file
  },
  getAssertionRuntime() {
    client.assertBrowserApiScope('utility')
    return assertions
  },
  getAssertionRuntimeForAssertions() {
    client.assertBrowserApiScope('assertion')
    return assertions
  },
})
replace('./source-maps', {
  createClientSourceMapResolver: () => ({ mapLocation: (value) => value }),
})
replace('./browser-context', {
  cleanupBrowserKeyboard() {},
  initializeBrowserContext: () => ({
    install() {},
    dispose() {
      trace.push('context-dispose')
    },
  }),
  cleanupBrowserContext() {
    trace.push('browser-cleanup')
  },
})
const config = {
  version: 1,
  ownerToken: 'component',
  authorization: 'component',
  sourceHash: 'a'.repeat(64),
  rpcURL: 'http://component/rpc',
  runId: 'run',
  entryId: 'entry',
  revision: 'revision',
  filePath,
  sourceMaps: [],
}
globalThis.location = { href: 'http://component/' }
globalThis.addEventListener = () => {}
globalThis.fetch = async (_url, request) => {
  if (!request?.method) return { ok: true, json: async () => config }
  const message = JSON.parse(request.body)
  messages.push(message)
  let value = null
  if (message.type === 'snapshot') {
    if (message.method === 'resolvePath')
      value = join(
        dirname(message.args[0]),
        '__snapshots__',
        basename(message.args[0]) + '.snap'
      )
    else if (message.method === 'resolveRawPath')
      value = resolve(dirname(message.args[0]), message.args[1])
    else if (message.method === 'readSnapshotFile') {
      try {
        value = readFileSync(message.args[0], 'utf8')
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    } else throw new Error('Unexpected snapshot method ' + message.method)
  }
  return { ok: true, json: async () => ({ value }) }
}
async function main() {
  try {
    globalThis.console = controlledConsole
    await local(runtimePath).startClientTest(
      () => {},
      undefined,
      () => {
        trace.push('create-tracker')
        tracker = createModuleImportTracker(context)
        return {
          waitForImports: tracker.waitForImports,
          dispose() {
            trace.push('imports-dispose')
            tracker.dispose()
          },
        }
      }
    )
    const pendingResult = pendingOutcome && (await pendingOutcome)
    const failures = messages
      .filter((message) => message.type === 'failure')
      .map((message) => message.error.message)
    const observed = {
      mode,
      observations,
      trace,
      messages,
      completeStatus: messages.at(-1)?.status,
      trackerRestored:
        prototype.l === originalLoad && prototype.L === originalURLLoad,
      nativeConsoleCalls,
      failures,
      pendingResult,
    }
    process.stdout.write(JSON.stringify(observed) + '\n')
    assert.deepEqual(controlledConsole, originalConsoleMethods)
    assert.equal(prototype.l, originalLoad)
    assert.equal(prototype.L, originalURLLoad)
    assert.equal(Date, originalDate)
    assert.equal(setTimeout, originalTimeout)
    assert.ok(
      trace.indexOf('create-tracker') < trace.indexOf('initialize-file')
    )
    assert.ok(
      trace.indexOf('imports-dispose') > trace.indexOf('file-dispose') ||
        mode === 'initialize-error'
    )
    assert.equal(trace.at(-1), 'context-dispose')
    const terminal = messages.at(-1)
    assert.equal(terminal.type, 'complete')
    assert.equal(terminal.status, mode === 'normal' ? 'passed' : 'failed')
    if (pendingOutcome)
      assert.match(
        pendingResult.message,
        /cancelled during file cleanup|after file cleanup/
      )
    if (mode !== 'initialize-error') {
      assert.equal(observations.length, 2)
      assert.throws(() => retained(), /originating file, hook or test scope/)
    }
    assert.deepEqual(
      failures,
      mode === 'normal'
        ? []
        : [
            (mode === 'initialize-error'
              ? initializationError
              : fileDisposeError
            ).message,
          ]
    )
  } finally {
    globalThis.console = originalConsole
    tracker?.dispose()
    rmSync(directory, { recursive: true, force: true })
  }
}
main().catch((error) => {
  globalThis.console = originalConsole
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
