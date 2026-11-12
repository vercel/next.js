const assert = require('node:assert/strict')
const { createDOMFixture, locatorGlobals } = require('./dom-fixture.cjs')
const { dom } = createDOMFixture({
  html: '<!DOCTYPE html><body></body>',
  globals: locatorGlobals,
  load: require,
})
const scopes = require('next/dist/experimental/testing/client/async-context')
const api = require('next/dist/experimental/testing/client/browser-context')
const mode = process.argv[2]
const trace = [],
  late = [],
  observed = []
const ordinary = Object.assign(new Error('public default cleanup rejection'), {
  name: 'PublicCleanupError',
  stack: '',
})
const observerError = new Error('actual observer failure')
const componentError =
  mode === 'same-error-mixed' ? ordinary : new Error('actual component failure')
const NativePromise = scopes.NativePromise
const baselineThen = Promise.prototype.then
const collection = scopes.createAsyncScope(
  { kind: 'collection', context: { id: 'file', name: 'file' } },
  (e) => late.push(e)
)
const hook = collection.run(() =>
  scopes.createAsyncScope(
    { kind: 'hook', context: { id: 'hook', suiteId: 'file', name: 'hook' } },
    (e) => late.push(e)
  )
)
const leave = scopes.enterCreatorScope(
  hook.run(() => scopes.captureCreatorScope())
)
let held = false,
  calls = 0,
  reads = 0,
  nativeUps = 0,
  nativeOther = 0,
  capturedCalls = 0,
  lateContinuation
const real = api.userEvent.cleanup
const retainedLocator = api.page.elementLocator(document.body)
const foreign = api.userEvent.setup()
const binding = api.initializeBrowserContext(async (command) => {
  if (command.method === 'keyboard') {
    held = true
    nativeOther++
    trace.push('hold')
    return { unreleased: ['Shift'] }
  }
  if (command.method === 'keyboardCleanup') {
    nativeUps++
    trace.push('real-up')
    held = false
    return null
  }
  nativeOther++
  throw new Error('unexpected native command ' + command.method)
})
function wrapped(callback) {
  const cell = scopes.captureCreatorScope()
  return function (...args) {
    const done = scopes.enterCreatorScope(cell)
    try {
      return callback.apply(this, args)
    } finally {
      done()
    }
  }
}
const wrap = function () {
  trace.push('wrapper')
  assert.equal(this, api.userEvent)
  if (mode === 'arbitrary-native') return api.userEvent.keyboard('{Alt>}')
  if (mode === 'foreign-resource') return foreign.cleanup()
  return real.call(api.userEvent).then(() => {
    capturedCalls++
    return NativePromise.resolve().then(() => {
      if (mode === 'arbitrary-native-after-await') return api.userEvent.tab()
      if (
        mode === 'arbitrary-page-after-await' ||
        mode === 'foreign-live-caller'
      )
        return api.page.elementLocator(document.body).click()
      if (mode === 'arbitrary-locator-after-await')
        return retainedLocator.click()
      if (mode === 'foreign-resource-after-await') return foreign.cleanup()
      if (mode === 'late-captured')
        lateContinuation = scopes.captureContinuationScope()
      return real.call(api.userEvent).then(() => {
        capturedCalls++
        if (!['success', 'before-success', 'late-captured'].includes(mode))
          throw mode === 'undefined' ? undefined : ordinary
      })
    })
  })
}
const publicMethod = wrapped(wrap)
const callerScope = scopes.createAsyncScope(
  {
    kind: 'hook',
    context: { id: 'foreign-live', suiteId: 'file', name: 'foreign-live' },
  },
  (e) => late.push(e)
)
Object.defineProperty(api.userEvent, 'cleanup', {
  configurable: true,
  get() {
    reads++
    trace.push('getter')
    assert.equal(this, api.userEvent)
    if (mode === 'getter-throw') throw ordinary
    if (mode === 'sync-throw')
      return function () {
        calls++
        assert.equal(this, api.userEvent)
        throw ordinary
      }
    if (
      mode === 'catch-getter-throw' ||
      mode === 'catch-call-throw' ||
      mode === 'catch-reject'
    )
      return function () {
        calls++
        const value = publicMethod.call(this)
        Object.defineProperty(value, 'catch', {
          get() {
            if (mode === 'catch-getter-throw') throw observerError
            return function (handler) {
              assert.equal(this, value)
              if (mode === 'catch-call-throw') throw observerError
              return NativePromise.prototype.then.call(
                value,
                undefined,
                (error) => {
                  handler(error)
                  throw observerError
                }
              )
            }
          },
        })
        return value
      }
    return function () {
      calls++
      return publicMethod.call(this)
    }
  },
})
async function settle(value) {
  try {
    await value
    return { status: 'fulfilled' }
  } catch (error) {
    return { status: 'rejected', error }
  }
}
async function main() {
  try {
    await api.userEvent.keyboard('{Shift>}')
    assert.equal(held, true)
    leave()
    hook.close()
    collection.close()
    const observation = {
      captureKeyboardError(error) {
        trace.push('capture')
        if (mode === 'capture-throw') throw observerError
        return {
          name: error?.name,
          message: error?.message,
          stack: error?.stack,
        }
      },
      onKeyboardCleanup(outcome) {
        assert.equal(this, observation)
        assert(Object.isFrozen(outcome))
        trace.push('observed')
        observed.push(outcome)
        if (mode === 'observer-throw') throw observerError
      },
      onComponentFailure(occurrence) {
        trace.push('component-observed')
        assert.equal(occurrence.error, componentError)
      },
    }
    if (mode === 'mixed' || mode === 'same-error-mixed')
      api.page[Symbol.for('vitest:component-cleanup')] = function () {
        throw componentError
      }
    const before = mode === 'before-success' || mode === 'before-reject'
    const invoke = () =>
      before
        ? api.cleanupBrowserKeyboard({ beforeAttempt: true, observation })
        : api.cleanupBrowserContext(observation)
    const result = await settle(
      mode === 'foreign-live-caller' ? callerScope.run(invoke) : invoke()
    )
    if (['success', 'before-success', 'late-captured'].includes(mode))
      assert.equal(result.status, 'fulfilled')
    else assert.equal(result.status, 'rejected')
    assert.equal(reads, 1)
    assert.equal(calls, mode === 'getter-throw' ? 0 : 1)
    assert.equal(Promise.prototype.then, baselineThen)
    const denied = ['arbitrary-native', 'foreign-resource'].includes(mode)
    if (denied) {
      assert.equal(nativeUps, 0)
      assert.equal(held, true)
      assert.equal(nativeOther, 1)
      assert(late.length > 0)
    } else if (
      mode.endsWith('-after-await') ||
      mode === 'foreign-live-caller'
    ) {
      assert.equal(nativeUps, 1)
      assert.equal(held, false)
      assert.equal(capturedCalls, 1)
      assert.equal(nativeOther, 1)
      assert(late.length > 0)
      if (mode === 'foreign-live-caller')
        callerScope.run(() => scopes.assertBrowserApiScope('utility'))
    } else if (mode === 'getter-throw' || mode === 'sync-throw') {
      assert.equal(nativeUps, 0)
      assert.equal(held, true)
    } else {
      assert.equal(nativeUps, 1)
      assert.equal(held, false)
      assert.equal(capturedCalls, 2)
    }
    if (before) {
      assert.equal(observed.length, 0)
      if (mode === 'before-reject') assert.equal(result.error, ordinary)
    } else {
      assert.equal(observed.length, 1)
      if (
        [
          'getter-throw',
          'sync-throw',
          'catch-getter-throw',
          'catch-call-throw',
          'capture-throw',
        ].includes(mode)
      )
        assert.equal(observed[0].ownership, 'call')
      if (
        [
          'reject',
          'undefined',
          'observer-throw',
          'mixed',
          'same-error-mixed',
        ].includes(mode)
      )
        assert.equal(observed[0].ownership, 'cleanup')
    }
    if (mode === 'observer-throw' || mode === 'capture-throw')
      assert.deepEqual(result.error.errors, [ordinary, observerError])
    if (mode === 'mixed' || mode === 'same-error-mixed')
      assert.deepEqual(result.error.errors, [componentError, ordinary])
    if (mode === 'catch-getter-throw' || mode === 'catch-call-throw')
      assert.deepEqual(result.error.errors, [observerError, ordinary])
    if (mode === 'catch-reject')
      assert.deepEqual(result.error.errors, [ordinary, observerError])
    if (mode === 'late-captured') {
      assert(lateContinuation)
      const result = await settle(
        lateContinuation.run(() => real.call(api.userEvent))
      )
      assert.equal(result.status, 'rejected')
      assert.match(
        result.error.message,
        /Late default Browser keyboard cleanup invocation/
      )
      assert.equal(nativeUps, 1)
      assert.equal(late.length, 1)
    }
    if (mode === 'undefined') assert.equal(result.error, undefined)
    process.stdout.write(
      JSON.stringify({
        mode,
        status: result.status,
        getterReads: reads,
        calls,
        realCalls: capturedCalls,
        nativeUps,
        held,
        late: late.length,
        observed: observed.map((x) => ({
          status: x.status,
          ownership: x.ownership,
        })),
        trace,
        intrinsicUnchanged: true,
      }) + '\n'
    )
  } finally {
    binding.dispose()
    dom.window.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
