const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { EventEmitter } = require('node:events')
const [method, mode, executePath] = process.argv.slice(2)
assert(['hover', 'unhover'].includes(method))
assert(
  [
    'success',
    'native-error',
    'barrier-held',
    'barrier-error',
    'barrier-cancel',
  ].includes(mode)
)
const req = createRequire(executePath)
const trace = [],
  selectors = [],
  actions = [],
  failures = [],
  events = []
const original = Object.assign(new Error('actual native hover failed'), {
  name: 'TimeoutError',
})
const controller = new AbortController()
const cancellation = new Error('cancel while native hover barrier is pending')
let releaseBarrier, rejectBarrier
let dispatch,
  operation,
  complete,
  admissions = 0
const completion = new Promise((resolve) => {
  complete = resolve
})
const page = new EventEmitter()
page.evaluate = async (callback) => {
  assert.equal(typeof callback, 'function')
  trace.push('barrier-start')
  if (mode === 'barrier-error') throw original
  if (mode === 'barrier-held' || mode === 'barrier-cancel')
    await new Promise((resolve, reject) => {
      releaseBarrier = resolve
      rejectBarrier = reject
    })
  callback()
  trace.push('barrier-end')
}
page.locator = (selector) => {
  selectors.push(selector)
  return {
    hover: async (options) => {
      assert.equal(trace.at(-1), 'barrier-end')
      trace.push('native-hover')
      actions.push({ method: 'hover', options, selector })
      if (mode === 'native-error' && actions.length === 1) throw original
    },
    click: async (options) => {
      actions.push({ method: 'click', options, selector })
    },
  }
}
page.goto = async () => {
  operation = dispatch(
    { method, element: 'next-test-locator-7', args: [{ timeout: 50 }] },
    () => {
      admissions++
    }
  )
  if (mode === 'barrier-held' || mode === 'barrier-cancel') {
    await new Promise(setImmediate)
    assert.equal(admissions, 1)
    assert.equal(actions.length, 0)
    assert.equal(trace.at(-1), 'barrier-start')
    if (mode === 'barrier-cancel') {
      operation.catch(() => {})
      controller.abort(cancellation)
      return
    }
    releaseBarrier()
  }
  if (mode === 'native-error' || mode === 'barrier-error') {
    await assert.rejects(operation, (error) => {
      assert.equal(error.cause, original)
      assert.equal(error.actionError.name, 'TimeoutError')
      return true
    })
    await dispatch(
      { method: 'click', element: 'next-test-element-0', args: [] },
      () => {
        admissions++
      }
    )
  } else await operation
  complete({})
}
const context = {
  newPage: async () => {
    trace.push('new-page')
    return page
  },
  close: async () => {
    trace.push('context-close')
    page.emit('close')
    if (mode === 'barrier-cancel') rejectBarrier(cancellation)
  },
}
const browser = {
  newContext: async () => {
    trace.push('new-context')
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
function replace(name, exports) {
  const filename = req.resolve(name)
  require.cache[filename] = { id: filename, filename, loaded: true, exports }
}
const selectorsBinding = {
  register: async (name, factory, options) => {
    assert.equal(name, 'nexttestlocator')
    assert.equal(typeof factory, 'function')
    assert.deepEqual(options, { contentScript: false })
    trace.push('register')
  },
}
replace('../browser/host', {
  createBrowserHost: async () => host,
  connectBrowserHost: async (options) => {
    await options.beforeConnect({ selectors: selectorsBinding })
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
replace('./engine-brand', {
  createClientEngineBrand: () => ({
    start: async () => {},
    fact: () => ({}),
    close() {},
    afterOwnersClosed: async () => {},
  }),
})
const profile = {
  id: 'unit-hover',
  environment: 'browser',
  mode: 'development',
  runtime: 'nodejs',
  bundler: 'turbopack',
  browserClient: true,
}
const entry = { id: 'entry', file: '/project/hover.test.mjs', profile }
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
  assert.equal(
    result.status,
    mode === 'barrier-cancel' ? 'cancelled' : 'passed'
  )
  assert.equal(page.listenerCount('console'), 0)
  assert.equal(
    admissions,
    mode === 'native-error' || mode === 'barrier-error' ? 2 : 1
  )
  assert(trace.indexOf('register') < trace.indexOf('new-context'))
  assert.equal(selectors[0], 'nexttestlocator=next-test-locator-7')
  if (mode === 'barrier-error' || mode === 'barrier-cancel') {
    assert.equal(trace.filter((value) => value === 'native-hover').length, 0)
  } else
    assert.deepEqual(actions[0], {
      method: 'hover',
      options: { timeout: 50 },
      selector: method === 'unhover' ? 'body' : selectors[0],
    })
  if (
    method === 'unhover' &&
    mode !== 'barrier-error' &&
    mode !== 'barrier-cancel'
  )
    assert.equal(selectors[1], 'body')
  if (mode === 'native-error' || mode === 'barrier-error')
    assert.equal(
      actions.at(-1).selector,
      '[data-next-test-element="next-test-element-0"]'
    )
  assert.deepEqual(
    trace.filter((value) => value.endsWith('-close')),
    ['context-close', 'browser-close', 'host-close', 'server-close']
  )
  assert.deepEqual(failures, [])
  console.log(
    JSON.stringify({
      method,
      mode,
      nativeOptions: true,
      literalBodyUnhover: true,
      originalErrorRetained: true,
      followingAction: true,
      cleanupJoined: true,
      ...(mode.startsWith('barrier-')
        ? {
            barrierBeforeNative: true,
            barrierFailureRetained: true,
            cancellationJoined: true,
          }
        : {}),
    })
  )
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
