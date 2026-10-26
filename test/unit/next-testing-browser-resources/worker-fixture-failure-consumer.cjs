const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const mode = process.argv[2]
assert.equal(mode, 'worker')
const runtimePath = require.resolve(
  'next/dist/experimental/testing/client/runtime'
)
const local = createRequire(runtimePath)
const replace = (name, exports) => {
  const filename = local.resolve(name)
  require.cache[filename] = { id: filename, filename, loaded: true, exports }
}
const trace = [],
  messages = []
let fileSettled = false,
  snapshotsTaken = false,
  started,
  release
const fileStarted = new Promise((resolve) => {
  started = resolve
})
const fileGate = new Promise((resolve) => {
  release = resolve
})
const reads = [],
  fields = {
    name: 'FixtureCleanupError',
    message: 'actual original worker failure',
    stack: '',
  },
  failure = {}
for (const key of ['name', 'message', 'stack'])
  Object.defineProperty(failure, key, {
    get() {
      reads.push(key)
      return fields[key]
    },
  })
const throws = (stage) => stage === 'file'
const file = {
  enableBrowserPublicTaskQueues() {},
  collect: async (load) => load(),
  validateBrowserClient: () => [],
  run: async () => ({
    cases: [],
    errors: [],
    interrupted: mode === 'cancelled',
  }),
  async dispose() {
    trace.push('file-start')
    started()
    await fileGate
    fileSettled = true
    trace.push('file-end')
    if (throws('file')) throw failure
  },
  takeOwnedWorkerDisposalFailure(error) {
    assert(fileSettled)
    assert.equal(error, failure)
    return Object.freeze({ error })
  },
  getSnapshotSummary: () => ({}),
  takeSnapshotUpdates() {
    snapshotsTaken = true
    return []
  },
}
replace('../runner', {
  getConsoleTask: () => undefined,
  getCurrentConsoleTask: () => undefined,
  initializeTestFile: () => file,
})
replace('./snapshot-environment', { installBrowserSnapshotBridge() {} })
replace('./source-maps', {
  createClientSourceMapResolver: () => ({ mapLocation: (value) => value }),
})
replace('./browser-context', {
  initializeBrowserContext: () => ({
    install() {},
    dispose: () => trace.push('context-dispose'),
  }),
  async cleanupBrowserContext() {
    assert(fileSettled)
    trace.push('browser')
    if (throws('browser')) throw new Error('actual browser cleanup failed')
  },
  async cleanupBrowserKeyboard() {
    assert(fileSettled)
    trace.push('keyboard')
    if (throws('keyboard')) throw new Error('actual keyboard cleanup failed')
  },
})
const config = {
  version: 1,
  ownerToken: 'fixture-order',
  authorization: 'fixture-order',
  sourceHash: 'a'.repeat(64),
  rpcURL: 'http://unit/rpc',
  runId: 'fixture-order',
  entryId: 'fixture-order',
  revision: 'fixture-order',
  filePath: '/fixture-order.test.mjs',
  sourceMaps: [],
}
const originalConsole = console
async function main() {
  globalThis.location = { href: 'http://unit/' }
  globalThis.addEventListener = () => {}
  globalThis.removeEventListener = () => {}
  globalThis.fetch = async (_url, request) => {
    if (!request?.method) return { ok: true, json: async () => config }
    messages.push(JSON.parse(request.body))
    return { ok: true, json: async () => ({ value: null }) }
  }
  // Runtime console control markers belong to this helper's private sink.
  globalThis.console = { ...originalConsole, debug() {} }
  const running = require(runtimePath).startClientTest(
    () => trace.push('load'),
    {
      initialize: () => ({ dispose: () => trace.push('mocks') }),
      register() {},
    },
    () => ({
      waitForImports: async () => {},
      dispose: () => {
        trace.push('imports')
        fields.name = 'LaterName'
        fields.message = 'later mutation'
        fields.stack = 'later stack'
      },
    })
  )
  try {
    await fileStarted
    assert.deepEqual(trace, ['load', 'file-start'])
    release()
    await running
  } finally {
    release()
    globalThis.console = originalConsole
  }
  assert.deepEqual(trace, [
    'load',
    'file-start',
    'file-end',
    'browser',
    'keyboard',
    'imports',
    'mocks',
    'context-dispose',
  ])
  const failures = messages.filter((message) => message.type === 'failure')
  assert.deepEqual(
    failures.map((message) => ({
      origin: message.origin,
      error: message.error,
    })),
    [
      {
        origin: 'worker-fixture-cleanup',
        error: {
          name: 'FixtureCleanupError',
          message: 'actual original worker failure',
          stack: '',
        },
      },
    ]
  )
  assert.deepEqual(reads, ['name', 'message', 'stack'])
  const terminal = messages.at(-1)
  assert.equal(terminal.type, 'complete')
  assert.equal(terminal.status, mode === 'normal' ? 'passed' : 'failed')
  assert.equal(terminal.interrupted, mode === 'cancelled')
  assert.equal(snapshotsTaken, mode === 'normal')
  process.stdout.write(
    JSON.stringify({
      mode,
      actualNameMessageStackCapturedAtJoinedOccurrence: true,
      oneReadEach: true,
      internalFailureAndPublicationVetoHeld: true,
    }) + '\n'
  )
}
main().catch((error) => {
  globalThis.console = originalConsole
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
