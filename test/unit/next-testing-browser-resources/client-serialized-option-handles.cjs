'use strict'
const assert = require('node:assert/strict')
const createClientTransportFixture = require('./client-transport-fixture.cjs')
const { EventEmitter } = require('node:events')
const [mode, executePath] = process.argv.slice(2)
assert(
  [
    'normal',
    'strings',
    'empty',
    'mixed',
    'native-error',
    'lookup-error',
    'missing',
    'dispose-error',
    'action-dispose-error',
    'first-error',
    'success-reply',
    'later-lookup-error',
    'cancel',
  ].includes(mode)
)
const trace = [],
  handles = [],
  actions = [],
  failures = [],
  events = []
const firstError = new Error('actual first option lookup rejection')
const nativeError = new Error('actual mixed or native selection error')
const disposeError = new Error('actual independent handle disposal error')
const cancellation = new Error('actual cancellation')
const controller = new AbortController()
let dispatch,
  complete,
  operation,
  releaseLookup,
  rejectLookup,
  caught,
  admissions = 0,
  tailRelease = false,
  releaseDispose,
  disposalReleased = false
const completion = new Promise((resolve) => {
  complete = resolve
})
const page = new EventEmitter()
page.locator = (selector) => {
  const locator = {
    describe(description) {
      trace.push('describe:' + description)
      return this
    },
    async elementHandle() {
      const index = selector === '#option-0' ? 0 : 1
      trace.push('lookup:' + index)
      if (
        index === 0 &&
        ['lookup-error', 'first-error', 'later-lookup-error'].includes(mode)
      )
        throw firstError
      if (
        index === 1 &&
        ['first-error', 'later-lookup-error', 'cancel'].includes(mode)
      ) {
        if (mode === 'cancel')
          queueMicrotask(() => controller.abort(cancellation))
        await new Promise((resolve, reject) => {
          releaseLookup = resolve
          rejectLookup = reject
        })
        tailRelease = true
        trace.push('lookup-released:1')
      }
      if (mode === 'missing' && index === 0) return null
      const handle = {
        index,
        async dispose() {
          trace.push('dispose:' + index)
          if (index === 0 && mode === 'success-reply') {
            await new Promise((resolve) => {
              releaseDispose = resolve
            })
            disposalReleased = true
            trace.push('dispose-released:0')
          }
          if (
            index === 0 &&
            ['dispose-error', 'action-dispose-error'].includes(mode)
          )
            throw disposeError
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
        ['mixed', 'native-error', 'action-dispose-error'].includes(mode)
      )
        throw nativeError
    },
  }
  return locator
}
const values =
  mode === 'strings'
    ? ['a', 'b']
    : mode === 'empty'
      ? []
      : mode === 'mixed'
        ? ['a', { element: { selector: '#option-0', locator: 'first option' } }]
        : [
            { element: { selector: '#option-0', locator: 'first option' } },
            { element: { selector: '#option-1', locator: 'second option' } },
          ]
const command = {
  method: 'selectOptions',
  locator: { selector: '#select', locator: 'actual select' },
  args: [values, { timeout: 50 }],
}
page.goto = async () => {
  operation = dispatch(command, () => {
    admissions++
    trace.push('admit')
  })
  try {
    await operation
    if (mode === 'success-reply') {
      assert.equal(
        disposalReleased,
        false,
        'actual successful reply does not await cleanup'
      )
      trace.push('successful-reply-returned')
      releaseDispose()
    }
  } catch (error) {
    caught = error
    if (mode === 'first-error' || mode === 'later-lookup-error') {
      assert.equal(error.cause, firstError)
      assert.equal(
        tailRelease,
        false,
        'first native rejection returns before independent pending lookup'
      )
      trace.push('first-error-returned')
      if (mode === 'later-lookup-error')
        rejectLookup(new Error('later already-handled lookup rejection'))
      else releaseLookup()
      trace.push('independent-lookup-release')
    }
    if (mode !== 'cancel') {
      await dispatch(
        { ...command, args: [['following'], { timeout: 50 }] },
        () => {
          admissions++
          trace.push('following-admit')
        }
      )
    }
  }
  complete({})
}
const execute = createClientTransportFixture({
  executePath,
  page,
  trace,
  failures,
  completion,
  setDispatch(value) {
    dispatch = value
  },
  getOperation: () => operation,
  beforePageClose: () => {
    releaseDispose?.()
    rejectLookup?.(cancellation)
  },
})
;(async () => {
  let result, failure
  try {
    result = await execute({
      profileId: 'serialized-option-handles',
      sourceFile: '/project/options.test.mjs',
      projectDir: '/project',
      signal: controller.signal,
      onEvent: (event) => events.push(event),
    })
  } catch (error) {
    failure = error
  }
  assert.equal(page.listenerCount('console'), 0)
  assert.deepEqual(
    trace.filter((x) => x.endsWith('-close')),
    ['context-close', 'browser-close', 'host-close', 'server-close']
  )
  assert.equal(
    trace.filter((x) => x.startsWith('dispose:')).length,
    handles.length,
    'all actual handles released independently'
  )
  if (['dispose-error', 'action-dispose-error'].includes(mode)) {
    assert(failure instanceof AggregateError)
    assert.deepEqual(failure.errors, [disposeError])
  } else {
    assert.equal(failure, undefined)
    assert.equal(result.status, mode === 'cancel' ? 'cancelled' : 'passed')
  }
  if (['mixed', 'native-error', 'action-dispose-error'].includes(mode))
    assert.equal(caught.cause, nativeError)
  if (
    mode === 'lookup-error' ||
    mode === 'first-error' ||
    mode === 'later-lookup-error'
  )
    assert.equal(caught.cause, firstError)
  if (mode === 'first-error') {
    assert.equal(tailRelease, true)
    assert(
      trace.indexOf('first-error-returned') < trace.indexOf('lookup-released:1')
    )
    assert.equal(handles.length, 1)
    assert.equal(actions.length, 1)
  }
  if (mode === 'later-lookup-error') {
    assert.equal(handles.length, 0)
    assert.equal(actions.length, 1)
    assert.equal(failures.length, 0)
  }
  if (mode === 'success-reply') {
    assert.equal(disposalReleased, true)
    assert(
      trace.indexOf('successful-reply-returned') <
        trace.indexOf('dispose-released:0')
    )
  }
  if (mode === 'normal') {
    assert.deepEqual(actions[0].values, handles)
    assert.deepEqual(
      trace.filter((x) => x.startsWith('dispose:')),
      ['dispose:0', 'dispose:1']
    )
    assert.deepEqual(actions[0].options, { timeout: 50 })
  }
  if (mode === 'strings' || mode === 'empty') {
    assert.deepEqual(actions[0].values, values)
    assert.equal(handles.length, 0)
  }
  if (mode === 'mixed') {
    assert.equal(actions[0].values[0], 'a')
    assert.equal(actions[0].values[1], handles[0])
  }
  if (mode === 'cancel') {
    assert.equal(actions.length, 0)
    assert.equal(handles.length, 1)
  }
  process.stdout.write(
    JSON.stringify({
      mode,
      trace,
      admissions,
      handles: handles.length,
      actions: actions.length,
      caught: !!caught,
      result: result?.status,
      failure: failure?.message,
      allOwnedTailsJoined: true,
    }) + '\n'
  )
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
