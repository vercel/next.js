const assert = require('node:assert/strict'),
  { createRequire } = require('node:module')
const mode = process.argv[2]
assert(
  [
    'normal',
    'keyboard',
    'keyboard-undefined',
    'keyboard-worker',
    'file-keyboard-worker-same',
    'legacy',
    'aggregate-same',
    'getter-values',
    'fulfilled-then-failure',
    'call-failure',
    'joined-captured',
    'late-owned',
  ].includes(mode)
)
const runtimePath = require.resolve(
    'next/dist/experimental/testing/client/runtime'
  ),
  local = createRequire(runtimePath)
const replace = (name, exports) => {
  const filename = local.resolve(name)
  require.cache[filename] = { id: filename, filename, loaded: true, exports }
}
const trace = [],
  messages = [],
  shared = Object.assign(new Error('same actual keyboard failure'), {
    name: 'FixtureCleanupError',
    stack: '',
  }),
  reads = []
const fields = {
    name: 'FixtureCleanupError',
    message: 'original keyboard getter failure',
    stack: '',
  },
  getterError = {}
for (const key of ['name', 'message', 'stack'])
  Object.defineProperty(getterError, key, {
    get() {
      assert.equal(this, getterError)
      reads.push(key)
      return fields[key]
    },
  })
const keyboard =
  mode === 'keyboard-undefined'
    ? undefined
    : ['getter-values', 'joined-captured'].includes(mode)
      ? getterError
      : shared
const workerFails = ['keyboard-worker', 'file-keyboard-worker-same'].includes(
    mode
  ),
  fileFails = mode === 'file-keyboard-worker-same'
let runtimeOptions
let snapshots = false,
  workerJoined = false,
  workerTaken = false
const file = {
  enableBrowserPublicTaskQueues() {},
  collect: async (load) => load(),
  validateBrowserClient: () => [],
  run: async (options) => (
    (runtimeOptions = options),
    {
      cases: [],
      errors: fileFails ? [{ phase: 'cleanup', error: shared }] : [],
      interrupted: false,
    }
  ),
  async dispose(options) {
    trace.push('file-start')
    await options?.beforeOwnedWorkerDispose?.()
    trace.push('worker')
    workerJoined = true
    if (workerFails) throw shared
  },
  takeOwnedWorkerDisposalFailure(error) {
    assert(workerJoined)
    if (!workerFails || workerTaken || error !== shared) return undefined
    workerTaken = true
    return Object.freeze({ error })
  },
  getSnapshotSummary: () => ({}),
  takeSnapshotUpdates() {
    snapshots = true
    return []
  },
}
replace('../runner', {
  getConsoleTask: () => undefined,
  getCurrentConsoleTask: () => undefined,
  initializeTestFile: (options) => {
    runtimeOptions = options
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
    dispose: () => trace.push('context-dispose'),
  }),
  async cleanupBrowserContext(observation) {
    trace.push('context')
    if (mode === 'legacy') throw shared
    trace.push('actual-keyboard')
    if (mode === 'late-owned')
      runtimeOptions.onLateFailure(new Error('actual independent late failure'))
    if (mode === 'joined-captured') {
      const captured = Object.freeze({
        value: observation.captureKeyboardError(keyboard),
      })
      fields.name = 'LaterName'
      fields.message = 'later keyboard mutation'
      fields.stack = 'later stack'
      observation.onKeyboardCleanup(
        Object.freeze({
          status: 'rejected',
          error: keyboard,
          ownership: 'cleanup',
          captured,
        })
      )
      throw keyboard
    }
    if (mode === 'call-failure') {
      observation.onKeyboardCleanup(
        Object.freeze({
          status: 'rejected',
          error: keyboard,
          ownership: 'call',
        })
      )
      throw keyboard
    }
    if (mode === 'normal' || mode === 'fulfilled-then-failure') {
      observation?.onKeyboardCleanup?.(Object.freeze({ status: 'fulfilled' }))
      if (mode !== 'normal') throw shared
      return
    }
    if (mode === 'aggregate-same')
      observation?.onComponentFailure?.(Object.freeze({ error: shared }))
    observation?.onKeyboardCleanup?.(
      Object.freeze({ status: 'rejected', error: keyboard })
    )
    if (['getter-values', 'joined-captured'].includes(mode)) {
      fields.name = 'LaterName'
      fields.message = 'later keyboard mutation'
      fields.stack = 'later stack'
    }
    if (mode === 'aggregate-same')
      throw new AggregateError([shared, shared], 'actual mixed cleanup')
    throw keyboard
  },
  async cleanupBrowserKeyboard() {
    trace.push('fallback-keyboard')
  },
})
const config = {
    version: 1,
    ownerToken: 'keyboard-occurrence',
    authorization: 'keyboard-occurrence',
    sourceHash: 'a'.repeat(64),
    rpcURL: 'http://unit/rpc',
    runId: 'keyboard-occurrence',
    entryId: 'keyboard-occurrence',
    revision: 'keyboard-occurrence',
    filePath: '/keyboard.test.mjs',
    sourceMaps: [],
  },
  originalConsole = console
async function main() {
  globalThis.location = { href: 'http://unit/' }
  globalThis.addEventListener = () => {}
  globalThis.removeEventListener = () => {}
  globalThis.fetch = async (_url, request) => {
    if (!request?.method) return { ok: true, json: async () => config }
    messages.push(JSON.parse(request.body))
    return { ok: true, json: async () => ({ value: null }) }
  }
  globalThis.console = { ...originalConsole, debug() {} }
  try {
    await require(runtimePath).startClientTest(
      () => trace.push('load'),
      {
        initialize: () => ({ dispose: () => trace.push('mocks') }),
        register() {},
      },
      () => ({
        waitForImports: async () => {},
        dispose: () => trace.push('imports'),
      })
    )
  } finally {
    globalThis.console = originalConsole
  }
  assert.deepEqual(trace, [
    'load',
    'file-start',
    'context',
    mode === 'legacy' ? 'fallback-keyboard' : 'actual-keyboard',
    'worker',
    'imports',
    'mocks',
    'context-dispose',
  ])
  const failures = messages.filter((message) => message.type === 'failure')
  const expectedOrigins =
    mode === 'normal'
      ? []
      : [
            'legacy',
            'aggregate-same',
            'fulfilled-then-failure',
            'call-failure',
          ].includes(mode)
        ? [undefined]
        : [
            ...(fileFails || mode === 'late-owned' ? [undefined] : []),
            'keyboard-cleanup',
            ...(workerFails ? ['worker-fixture-cleanup'] : []),
          ]
  assert.deepEqual(
    failures.map((value) => value.origin),
    expectedOrigins
  )
  if (['getter-values', 'joined-captured'].includes(mode)) {
    assert.deepEqual(reads, ['name', 'message', 'stack'])
    assert.deepEqual(failures[0].error, {
      name: 'FixtureCleanupError',
      message: 'original keyboard getter failure',
      stack: '',
    })
  }
  if (mode === 'keyboard-undefined') assert.deepEqual(failures[0].error, {})
  assert.equal(messages.at(-1).type, 'complete')
  assert.equal(messages.at(-1).status, mode === 'normal' ? 'passed' : 'failed')
  assert.equal(snapshots, mode === 'normal')
  assert.deepEqual(messages.at(-1).updates, [])
  process.stdout.write(
    JSON.stringify({
      mode,
      onlyJoinedSoleKeyboardClassified: true,
      noDuplicateAfterActualOutcome: true,
      oldDoubleFallbackHeld: true,
      undefinedRejectionDistinct: true,
      mixedAndIndependentFailureVetoHeld: true,
      originalFieldReadsAndSnapshotsHeld: true,
    }) + '\n'
  )
}
main().catch((error) => {
  globalThis.console = originalConsole
  process.stderr.write(String(error?.stack ?? error) + '\n')
  process.exitCode = 1
})
