const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { EventEmitter } = require('node:events')
const [mode, executePath, family] = process.argv.slice(2),
  req = createRequire(executePath)
assert(
  [
    'click',
    'fill',
    'present',
    'native-error',
    'cancel',
    'wrong-method',
    'malformed-id',
    'registration-error',
    'registration-cancel',
  ].includes(mode)
)
if (family !== undefined)
  assert(['dblClick', 'tripleClick', 'clear'].includes(family))
const trace = [],
  actions = [],
  selectors = [],
  failures = [],
  events = [],
  controller = new AbortController()
const nativeError = Object.assign(
    new Error('actual native query action rejected'),
    { name: 'TimeoutError' }
  ),
  registrationError = new Error('actual selector registration rejected'),
  cancelReason = new Error('actual query action cancelled')
let dispatch,
  complete,
  operation,
  caught,
  rejectAction,
  admissions = 0
const completion = new Promise((resolve) => {
  complete = resolve
})
const page = new EventEmitter()
page.locator = (selector) => {
  selectors.push(selector)
  return {
    click: (options) => perform('click', [options]),
    dblclick: (options) => perform('dblclick', [options]),
    fill: (value, options) => perform('fill', [value, options]),
    clear: (options) => perform('clear', [options]),
  }
}
async function perform(method, args) {
  trace.push(method)
  actions.push({ method, args })
  if (mode === 'native-error' && actions.length === 1) throw nativeError
  if (mode === 'cancel') {
    queueMicrotask(() => controller.abort(cancelReason))
    await new Promise((_, reject) => {
      rejectAction = reject
    })
  }
}
const command = {
  method:
    mode === 'wrong-method'
      ? 'upload'
      : (family ?? (mode === 'fill' ? 'fill' : 'click')),
  element:
    mode === 'present'
      ? 'next-test-element-0'
      : mode === 'malformed-id'
        ? 'next-test-locator-7"],body'
        : 'next-test-locator-7',
  args: mode === 'fill' ? ['value', { timeout: 50 }] : [{ timeout: 50 }],
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
    if (mode === 'wrong-method' || mode === 'malformed-id') throw error
    if (mode === 'native-error') {
      assert.equal(error.cause, nativeError)
      assert.equal(error.actionError.name, 'TimeoutError')
      await dispatch(
        { method: 'click', element: 'next-test-element-0', args: [] },
        () => {
          admissions++
          trace.push('admit')
        }
      )
    }
  }
  complete({})
}
const context = {
  newPage: async () => {
    trace.push('new-page')
    return page
  },
  close: async () => {
    trace.push('context-close')
    rejectAction?.(nativeError)
    page.emit('close')
  },
}
const browser = {
  newContext: async () => {
    trace.push('new-context')
    return context
  },
  close: async () => trace.push('browser-close'),
}
const host = {
  wsEndpoint: 'ws://unit',
  dispose: async () => trace.push('host-close'),
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
const actualSelectors = {
  register: async (name, factory, options) => {
    trace.push('register')
    assert.equal(name, 'nexttestlocator')
    assert.equal(typeof factory, 'function')
    assert.deepEqual(options, { contentScript: false })
    if (mode === 'registration-error') throw registrationError
    if (mode === 'registration-cancel') controller.abort(cancelReason)
  },
}
replace('../browser/host', {
  createBrowserHost: async () => host,
  connectBrowserHost: async (options) => {
    assert.equal(typeof options.beforeConnect, 'function')
    await options.beforeConnect({ selectors: actualSelectors })
    trace.push('connect')
    return browser
  },
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
    id: 'unit-query',
    environment: 'browser',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
    browserClient: true,
  },
  entry = { id: 'entry', file: '/project/query.test.mjs', profile }
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
  const result = await require(executePath).executeClient(artifact, {
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
  assert.equal(page.listenerCount('console'), 0)
  const closed = trace.filter((value) => value.endsWith('-close'))
  if (mode === 'registration-error') {
    assert.equal(result.status, 'failed')
    assert.deepEqual(closed, ['host-close', 'server-close'])
    assert.equal(actions.length, 0)
  } else if (mode === 'registration-cancel') {
    assert.equal(result.status, 'cancelled')
    assert.deepEqual(closed, ['browser-close', 'host-close', 'server-close'])
    assert.equal(actions.length, 0)
  } else {
    assert.deepEqual(closed, [
      'context-close',
      'browser-close',
      'host-close',
      'server-close',
    ])
    if (mode === 'wrong-method' || mode === 'malformed-id') {
      assert.equal(result.status, 'failed')
      assert.equal(admissions, 0)
      assert.equal(actions.length, 0)
      assert.equal(caught.actionError, undefined)
    } else if (mode === 'cancel') {
      assert.equal(result.status, 'cancelled')
      assert.equal(admissions, 1)
    } else {
      assert.equal(result.status, 'passed')
      assert(trace.indexOf('register') < trace.indexOf('new-context'))
      assert.equal(
        selectors[0],
        mode === 'present'
          ? '[data-next-test-element="next-test-element-0"]'
          : 'nexttestlocator=next-test-locator-7'
      )
      assert.equal(admissions, mode === 'native-error' ? 2 : 1)
      if (family) {
        assert.deepEqual(actions[0], {
          method:
            family === 'clear'
              ? 'clear'
              : family === 'dblClick'
                ? 'dblclick'
                : 'click',
          args: [
            family === 'dblClick' || family === 'clear'
              ? { timeout: 50 }
              : { timeout: 50, clickCount: 3 },
          ],
        })
      }
    }
  }
  process.stdout.write(
    JSON.stringify({
      mode,
      status: result.status,
      trace,
      selectors,
      actions,
      admissions,
      cleanupJoined: true,
      originalNativeErrorRetained: true,
      terminalMalformedBeforeAdmission: true,
    }) + '\n'
  )
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
