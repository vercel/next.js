const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { EventEmitter } = require('node:events')
const [mode, executePath] = process.argv.slice(2)
const req = createRequire(executePath)
const modes = [
  'normal',
  'strings',
  'empty',
  'action-error',
  'lookup-error',
  'missing',
  'dispose-error',
  'action-dispose-error',
  'cancel',
  'malformed-id',
  'malformed-key',
  'malformed-null',
  'malformed-array',
  'malformed-mixed',
]
assert(modes.includes(mode))
const trace = [],
  actions = [],
  failures = [],
  events = [],
  handles = []
const nativeError = Object.assign(
  new Error('actual native option selection rejected'),
  { name: 'TimeoutError' }
)
const lookupError = new Error('actual option handle lookup rejected')
const closeError = new Error('actual option handle disposal rejected')
const cancellation = new Error('actual option selection cancelled')
const controller = new AbortController()
let dispatch,
  complete,
  rejectLookup,
  operation,
  caught,
  admissions = 0
const completion = new Promise((resolve) => {
  complete = resolve
})
const page = new EventEmitter()
page.locator = (selector) => ({
  async elementHandle() {
    const index = selector.includes('element-1') ? 0 : 1
    trace.push('lookup:' + index)
    if (index === 1) {
      if (mode === 'lookup-error') throw lookupError
      if (mode === 'missing') return null
      if (mode === 'cancel') {
        queueMicrotask(() => controller.abort(cancellation))
        await new Promise((_, reject) => {
          rejectLookup = reject
        })
      }
    }
    const handle = {
      index,
      async dispose() {
        trace.push('dispose:' + index)
        if (
          index === 0 &&
          ['dispose-error', 'action-dispose-error'].includes(mode)
        )
          throw closeError
      },
    }
    handles.push(handle)
    return handle
  },
  async selectOption(values, options) {
    trace.push('select')
    actions.push({ values, options })
    if (
      actions.length === 1 &&
      ['action-error', 'action-dispose-error'].includes(mode)
    )
      throw nativeError
  },
})
const selectedValues =
  mode === 'strings'
    ? ['one', 'three']
    : mode === 'empty'
      ? []
      : [{ element: 'next-test-element-1' }, { element: 'next-test-element-2' }]
if (mode === 'malformed-id') selectedValues[0].element = 'foreign-owner'
if (mode === 'malformed-key') selectedValues[0].extra = true
if (mode === 'malformed-null') selectedValues[0] = null
if (mode === 'malformed-mixed') selectedValues[0] = 'one'
const command = {
  method: 'selectOptions',
  element: 'next-test-element-0',
  args: [mode === 'malformed-array' ? 'one' : selectedValues, { timeout: 50 }],
}
page.goto = async () => {
  operation = dispatch(command, () => {
    admissions++
    trace.push('admit')
  })
  try {
    await operation
  } catch (error) {
    caught = error
    if (mode.startsWith('malformed')) throw error
    if (mode !== 'cancel') {
      assert(error.actionError)
      if (mode === 'action-error' || mode === 'action-dispose-error')
        assert.equal(error.cause, nativeError)
      if (mode === 'lookup-error') assert.equal(error.cause, lookupError)
      assert(
        handles.every((handle) => trace.includes('dispose:' + handle.index))
      )
      await dispatch({ ...command, args: [['three'], { timeout: 50 }] }, () => {
        admissions++
        trace.push('admit')
      })
    }
  }
  complete({})
}
const context = {
  newPage: async () => page,
  async close() {
    trace.push('context-close')
    rejectLookup?.(lookupError)
    page.emit('close')
  },
}
const browser = {
  newContext: async () => context,
  async close() {
    trace.push('browser-close')
  },
}
const host = {
  wsEndpoint: 'ws://unit',
  async dispose() {
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
  async dispose() {
    trace.push('server-close')
    await operation?.catch(() => {})
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
function replace(name, exports) {
  const filename = req.resolve(name)
  require.cache[filename] = { id: filename, filename, loaded: true, exports }
}
replace('../browser/host', {
  createBrowserHost: async () => host,
  connectBrowserHost: async () => browser,
})
replace('./server', {
  createClientServer: async (options) => {
    dispatch = options.onBrowserCommand
    return server
  },
})
replace('./results', { createClientResultCollector: () => collector })
replace('./engine-brand', { createClientEngineBrand: () => brand })
const profile = {
  id: 'option-handles',
  environment: 'browser',
  mode: 'development',
  runtime: 'nodejs',
  bundler: 'turbopack',
  browserClient: true,
}
const entry = { id: 'entry', file: '/project/options.test.mjs', profile }
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
;(async () => {
  let result, failure
  try {
    result = await require(executePath).executeClient(artifact, {
      entry,
      runId: 'run',
      projectDir: '/project',
      setupFiles: [],
      signal: controller.signal,
      updateSnapshots: false,
      testTimeout: 1000,
      hookTimeout: 1000,
      fileTimeout: 5000,
      onEvent: (event) => events.push(event),
    })
  } catch (error) {
    failure = error
  }
  assert.equal(page.listenerCount('console'), 0)
  assert.deepEqual(
    trace.filter((value) => value.endsWith('-close')),
    ['context-close', 'browser-close', 'host-close', 'server-close']
  )
  assert.equal(
    trace.filter((value) => value.startsWith('dispose:')).length,
    handles.length
  )
  if (mode.startsWith('malformed')) {
    assert.equal(admissions, 0)
    assert.equal(actions.length, 0)
    assert.equal(handles.length, 0)
    assert.equal(caught.actionError, undefined)
    assert.equal(result.status, 'failed')
  } else if (mode === 'cancel') {
    assert.equal(result.status, 'cancelled')
    assert.equal(actions.length, 0)
    assert.equal(handles.length, 1)
    assert(trace.indexOf('dispose:0') > trace.indexOf('context-close'))
  } else if (['dispose-error', 'action-dispose-error'].includes(mode)) {
    assert(failure instanceof AggregateError)
    assert.deepEqual(failure.errors, [closeError])
    assert.equal(
      caught?.cause,
      mode === 'action-dispose-error' ? nativeError : undefined
    )
  } else {
    assert.equal(failure, undefined)
    assert.equal(result.status, 'passed')
  }
  if (mode === 'normal') {
    assert.deepEqual(actions[0].values, handles)
    assert.equal(trace.indexOf('admit'), 0)
    assert(trace.indexOf('select') < trace.indexOf('dispose:0'))
    assert(trace.indexOf('dispose:1') < trace.indexOf('context-close'))
    assert.deepEqual(actions[0].options, { timeout: 50 })
  }
  if (mode === 'strings' || mode === 'empty') {
    assert.deepEqual(actions[0].values, selectedValues)
    assert.equal(handles.length, 0)
  }
  process.stdout.write(
    JSON.stringify({
      mode,
      trace,
      admissions,
      handles: handles.length,
      actions: actions.map((action) => ({
        values: action.values.map((value) =>
          typeof value === 'string' ? value : { actualHandle: value.index }
        ),
        options: action.options,
      })),
      caught: caught
        ? { name: caught.actionError?.name, message: caught.message }
        : null,
      result: result?.status,
      failure: failure?.message,
      cleanupComplete: true,
    }) + '\n'
  )
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
