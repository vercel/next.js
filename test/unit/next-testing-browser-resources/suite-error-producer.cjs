const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const mode = process.argv[2]
assert(
  [
    'exact',
    'foreign-failure',
    'multiple-owners',
    'prior-global',
    'shared-stages',
    'changed-fields',
    'no-suite',
    'distinct-slots',
    'unhandled-promise',
  ].includes(mode)
)
const runtimePath = require.resolve(
  'next/dist/experimental/testing/client/runtime'
)
const local = createRequire(runtimePath)
function replace(name, exports) {
  const filename = local.resolve(name)
  require.cache[filename] = { id: filename, filename, loaded: true, exports }
}
const primitive = local('../primitives/error')
const serializations = []
replace('../primitives/error', {
  ...primitive,
  processError(error) {
    serializations.push(error)
    return primitive.processError(error)
  },
})
const shared = new Error('actual suite cleanup failure')
shared.name = 'FixtureCleanupError'
shared.stack = ''
const second = new Error('second actual suite cleanup failure')
second.name = shared.name
second.stack = ''
const failure = { phase: 'cleanup', error: shared }
const foreign = { phase: 'cleanup', error: shared }
const other = { phase: 'cleanup', error: second }
const messages = [],
  trace = []
let onUnhandledRejection
let workerJoined = false,
  workerTaken = false,
  snapshots = false
const suite = (suiteId, errors) => ({
  entryId: 'entry',
  suiteId,
  name: '',
  ancestors: [],
  mode: 'run',
  status: 'failed',
  durationMs: 0,
  errors,
})
const file = {
  enableBrowserPublicTaskQueues() {},
  collect: async (load) => load(),
  validateBrowserClient: () => [],
  async run(options) {
    if (mode === 'unhandled-promise')
      onUnhandledRejection(shared, Promise.resolve(), true, true)
    if (mode !== 'no-suite')
      await options.onSuiteEnd(
        suite(
          'entry',
          mode === 'distinct-slots' ? [failure, other] : [failure]
        ),
        {}
      )
    if (mode === 'multiple-owners')
      await options.onSuiteEnd(suite('entry/child', [failure]), {})
    return {
      cases: [],
      errors:
        mode === 'foreign-failure'
          ? [foreign]
          : mode === 'distinct-slots'
            ? [failure, other]
            : [failure],
      interrupted: false,
    }
  },
  async dispose(options) {
    trace.push('file')
    await options?.beforeOwnedWorkerDispose?.()
    trace.push('worker')
    workerJoined = true
    if (mode === 'shared-stages') throw shared
  },
  takeOwnedWorkerDisposalFailure(error) {
    assert(workerJoined)
    if (mode !== 'shared-stages' || workerTaken || error !== shared)
      return undefined
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
  initializeTestFile(options) {
    onUnhandledRejection = options.onUnhandledRejection
    return file
  },
  getConsoleTask: () => undefined,
  getCurrentConsoleTask: () => undefined,
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
  async cleanupBrowserContext(observation) {
    trace.push('component')
    if (mode === 'changed-fields')
      shared.message = 'later changed suite failure'
    if (mode === 'shared-stages') {
      observation?.onComponentFailure?.(Object.freeze({ error: shared }))
      throw shared
    }
  },
  async cleanupBrowserKeyboard() {
    trace.push('keyboard')
  },
})
const config = {
  version: 1,
  ownerToken: 'suite-occurrence',
  authorization: 'suite-occurrence',
  sourceHash: 'a'.repeat(64),
  rpcURL: 'http://unit/rpc',
  runId: 'run',
  entryId: 'entry',
  revision: 'revision',
  filePath: '/suite-errors.test.mjs',
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
  globalThis.console = { ...originalConsole, debug() {} }
  try {
    await require(runtimePath).startClientTest(() => trace.push('load'), {
      initialize(report) {
        if (mode === 'prior-global') report(shared)
        return { dispose() {} }
      },
      register() {},
    })
  } finally {
    globalThis.console = originalConsole
  }
  assert.deepEqual(trace, [
    'load',
    'file',
    'component',
    'keyboard',
    'worker',
    'context',
  ])
  const failures = messages.filter((message) => message.type === 'failure')
  const ordinary = failures.filter((message) => message.origin === undefined)
  assert.equal(ordinary.length, mode === 'distinct-slots' ? 2 : 1)
  const owned = [
    'exact',
    'shared-stages',
    'changed-fields',
    'distinct-slots',
  ].includes(mode)
  for (const [index, message] of ordinary.entries()) {
    assert.deepEqual(
      message.suiteError,
      owned ? { suiteId: 'entry', index } : undefined
    )
  }
  if (mode === 'shared-stages') {
    assert.deepEqual(
      failures.map((message) => message.origin),
      [undefined, 'component-cleanup', 'worker-fixture-cleanup']
    )
    assert(failures.slice(1).every((message) => !('suiteError' in message)))
  } else assert.equal(failures.length, ordinary.length)
  if (mode === 'changed-fields') {
    assert.equal(
      messages.find((message) => message.type === 'suite-end').result.errors[0]
        .error.message,
      'actual suite cleanup failure'
    )
    assert.equal(ordinary[0].error.message, 'later changed suite failure')
  }
  const expectedReads =
    mode === 'multiple-owners'
      ? 3
      : mode === 'distinct-slots'
        ? 4
        : mode === 'no-suite'
          ? 1
          : 2
  assert.equal(serializations.length, expectedReads)
  assert.equal(messages.at(-1).status, 'failed')
  assert.equal(snapshots, false)
  assert.deepEqual(messages.at(-1).updates, [])
  process.stdout.write(
    JSON.stringify({
      mode,
      actualRunnerFailureIdentityOnly: true,
      finalSerializerCalls: expectedReads,
      ordinaryFailures: ordinary.length,
      independentCleanupOriginsHeld: true,
      snapshotVetoHeld: true,
    }) + '\n'
  )
}
main().catch((error) => {
  globalThis.console = originalConsole
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
