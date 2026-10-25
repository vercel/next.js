const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const [mode, runtimePath] = process.argv.slice(2)
assert(
  [
    'ordered',
    'queued-task-update',
    'action-error',
    'network-error',
    'json-error',
    'error-envelope',
    'output-error',
  ].includes(mode)
)
const requireRuntime = createRequire(runtimePath)
const nativeConsole = console
const methods = ['log', 'info', 'debug', 'warn', 'error']
const targetConsole = Object.fromEntries(
  methods.map((method) => [
    method,
    function () {
      assert.equal(this, targetConsole)
    },
  ])
)
const originals = { ...targetConsole }
const trace = [],
  messages = []
let dispatch,
  releaseAction,
  enterAction,
  releaseOutput,
  second,
  firstSettled = false,
  secondSettled = false
const actionGate = new Promise((resolve) => {
  releaseAction = resolve
})
const actionEntered = new Promise((resolve) => {
  enterAction = resolve
})
let taskUpdateQueued, releaseTaskUpdate
const taskUpdateEnqueued = new Promise((resolve) => {
  taskUpdateQueued = resolve
})
const taskUpdateGate = new Promise((resolve) => {
  releaseTaskUpdate = resolve
})
const outputGate = new Promise((resolve) => {
  releaseOutput = resolve
})
const failure =
  mode === 'network-error'
    ? new TypeError('actual native response stream rejected')
    : new SyntaxError('actual native response JSON rejected')
const tick = () => new Promise((resolve) => setImmediate(resolve))
const file = {
  enableBrowserPublicTaskQueues() {},
  collect: async (load) => load(),
  validateBrowserClient: () => [],
  async run(options) {
    if (mode === 'queued-task-update') {
      const actualFile = {
        id: 'entry',
        type: 'suite',
        name: 'case.mjs',
        fullName: 'case.mjs',
        mode: 'run',
        meta: {},
        tags: [],
        filepath: '/case.mjs',
        projectName: 'unit',
        tasks: [],
      }
      const task = {
        id: 'entry/0',
        type: 'test',
        name: 'actual',
        fullName: 'actual',
        mode: 'run',
        meta: {},
        tags: [],
        annotations: [],
        artifacts: [],
        file: actualFile,
        suite: actualFile,
        result: { state: 'run' },
      }
      actualFile.tasks.push(task)
      await options.onCollected(actualFile)
      options.onCaseStart({
        id: 'run/entry/0/0/0',
        fileId: 'entry',
        testId: 'entry/0',
        name: 'actual',
        retry: 0,
        repeat: 0,
      })
    }
    trace.push('body')
    try {
      await dispatch({
        element: 'next-test-element-0',
        method: 'dragAndDrop',
        args: ['next-test-element-1'],
      })
      trace.push('action-fulfilled')
    } catch (error) {
      trace.push('action-rejected:' + error.name + ':' + error.message)
      if (mode !== 'action-error') throw error
    } finally {
      firstSettled = true
    }
    if (second) await second
    trace.push('body-finished')
    return { cases: [], errors: [], interrupted: false }
  },
  dispose() {
    trace.push('file-cleanup')
  },
  getSnapshotSummary: () => ({}),
  takeSnapshotUpdates: () => [],
}
function replace(name, exports) {
  const filename = requireRuntime.resolve(name)
  require.cache[filename] = { id: filename, filename, loaded: true, exports }
}
if (mode === 'queued-task-update') {
  const actual = requireRuntime('../reporting/task-updates')
  replace('../reporting/task-updates', {
    ...actual,
    createReporterTaskUpdates(options) {
      return actual.createReporterTaskUpdates({
        onUpdate(update) {
          const sent = options.onUpdate(update)
          if (update.taskUpdateIds.includes('entry/0')) {
            trace.push('actual-task-update-queued')
            taskUpdateQueued()
          }
          return sent
        },
      })
    },
  })
}
replace('../runner', {
  initializeTestFile: () => file,
  getConsoleTask: () => ({ taskId: 'entry/0' }),
})
replace('./snapshot-environment', { installBrowserSnapshotBridge() {} })
replace('./source-maps', {
  createClientSourceMapResolver: () => ({ mapLocation: (value) => value }),
})
replace('./browser-context', {
  initializeBrowserContext(send) {
    dispatch = send
    return {
      install() {},
      dispose() {
        trace.push('context-cleanup')
      },
    }
  },
  cleanupBrowserKeyboard() {},
  cleanupBrowserContext() {
    trace.push('browser-cleanup')
  },
})
globalThis.location = { href: 'http://unit/' }
globalThis.addEventListener = () => {}
const config = {
  version: 1,
  ownerToken: 'actual',
  authorization: 'actual',
  sourceHash: 'a'.repeat(64),
  rpcURL: 'http://unit/rpc',
  runId: 'run',
  entryId: 'entry',
  revision: 'rev',
  filePath: '/case.mjs',
  sourceMaps: [],
  ...(mode === 'queued-task-update' ? { captureTaskResults: true } : {}),
}
globalThis.fetch = async (_url, options) => {
  if (!options?.method) return { ok: true, json: async () => config }
  const message = JSON.parse(options.body)
  messages.push(message)
  trace.push(
    'request:' +
      message.type +
      (message.command ? ':' + message.command.method : '')
  )
  if (
    message.type === 'browser-command' &&
    message.command.method === 'dragAndDrop'
  )
    return {
      ok: true,
      json: async () => {
        trace.push('action-body-pending')
        enterAction()
        await actionGate
        trace.push('action-body-reply')
        if (mode === 'network-error' || mode === 'json-error') throw failure
        if (mode === 'error-envelope')
          return { error: 'Browser Mode transport failed.' }
        if (mode === 'action-error')
          return {
            actionError: {
              name: 'TimeoutError',
              message: 'actual native action rejected',
              stack: 'held native action',
            },
          }
        return { value: null }
      },
    }
  if (
    message.type === 'task-update' &&
    message.taskUpdateIds.includes('entry/0')
  )
    return {
      ok: true,
      json: async () => {
        trace.push('task-update-body-pending')
        await taskUpdateGate
        trace.push('task-update-body-reply')
        return { value: null }
      },
    }
  if (message.type === 'output') {
    if (mode === 'output-error')
      throw new Error('actual console transport rejected')
    return {
      ok: true,
      json: async () => {
        trace.push('output-body-pending')
        await outputGate
        trace.push('output-body-reply')
        return { value: null }
      },
    }
  }
  return { ok: true, json: async () => ({ value: null }) }
}
async function main() {
  let runtimeFailure,
    beforeOutputReply,
    afterOutputReply,
    settled = false
  globalThis.console = targetConsole
  const running = require(runtimePath).startClientTest(() => {})
  running.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    }
  )
  try {
    await Promise.race([
      actionEntered,
      running.then(() => {
        throw new Error('Runtime ended before native action')
      }),
    ])
    if (mode === 'queued-task-update') await taskUpdateEnqueued
    targetConsole.log('native action console')
    if (mode === 'queued-task-update') {
      await tick()
      assert(!messages.some((message) => message.type === 'output'))
      assert(trace.includes('task-update-body-pending'))
      releaseTaskUpdate()
    }
    await tick()
    second = dispatch({
      element: 'next-test-element-0',
      method: 'click',
      args: [],
    }).then(
      () => {
        secondSettled = true
      },
      (error) => {
        secondSettled = true
        throw error
      }
    )
    second.catch(() => {})
    await tick()
    beforeOutputReply = {
      outputRequested: messages.some((message) => message.type === 'output'),
      firstSettled,
      secondRequested: messages.some(
        (message) => message.command?.method === 'click'
      ),
      secondSettled,
      terminalPublished: messages.some(
        (message) => message.type === 'complete'
      ),
      runtimeSettled: settled,
    }
    releaseOutput()
    await tick()
    afterOutputReply = {
      outputReplied: trace.includes('output-body-reply'),
      firstSettled,
      secondRequested: messages.some(
        (message) => message.command?.method === 'click'
      ),
      secondSettled,
      terminalPublished: messages.some(
        (message) => message.type === 'complete'
      ),
    }
  } finally {
    releaseTaskUpdate()
    releaseOutput()
    releaseAction()
  }
  try {
    await running
  } catch (error) {
    runtimeFailure = { name: error.name, message: error.message }
  }
  globalThis.console = nativeConsole
  const observed = {
    mode,
    beforeOutputReply,
    afterOutputReply,
    messages,
    trace,
    runtimeFailure,
    restored: methods.every(
      (method) => targetConsole[method] === originals[method]
    ),
  }
  process.stdout.write(JSON.stringify(observed) + '\n')
  assert.deepEqual(beforeOutputReply, {
    outputRequested: true,
    firstSettled: false,
    secondRequested: false,
    secondSettled: false,
    terminalPublished: false,
    runtimeSettled: false,
  })
  assert.equal(afterOutputReply.firstSettled, false)
  assert.equal(afterOutputReply.secondRequested, false)
  assert.equal(afterOutputReply.terminalPublished, false)
  if (mode === 'queued-task-update') {
    assert(
      trace.indexOf('actual-task-update-queued') <
        trace.indexOf('request:output')
    )
    assert(
      trace.indexOf('task-update-body-reply') < trace.indexOf('request:output')
    )
    assert(
      trace.indexOf('output-body-reply') < trace.indexOf('action-body-reply')
    )
  } else assert(!messages.some((message) => message.type === 'task-update'))
  assert.equal(observed.restored, true)
  assert(trace.includes('file-cleanup') && trace.includes('context-cleanup'))
  assert.deepEqual(
    messages.map((message) => message.sequence),
    messages.map((_, i) => i)
  )
  if (['ordered', 'queued-task-update', 'action-error'].includes(mode)) {
    assert.equal(runtimeFailure, undefined)
    assert.equal(afterOutputReply.outputReplied, true)
    assert.equal(secondSettled, true)
    assert.equal(messages.at(-1).type, 'complete')
    assert.equal(messages.at(-1).status, 'passed')
    assert(
      trace.indexOf('output-body-reply') < trace.indexOf('action-body-reply')
    )
  } else {
    assert(runtimeFailure)
    assert(!messages.some((message) => message.type === 'complete'))
    assert(!messages.some((message) => message.command?.method === 'click'))
  }
}
main().catch((error) => {
  globalThis.console = nativeConsole
  console.error(error)
  process.exitCode = 1
})
