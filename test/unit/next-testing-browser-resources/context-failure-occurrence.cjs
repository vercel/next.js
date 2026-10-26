const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const provider = createRequire(require.resolve('jest-environment-jsdom'))
const { JSDOM } = require(provider.resolve('jsdom'))
const dom = new JSDOM('<!DOCTYPE html><body></body>')
for (const name of [
  'document',
  'window',
  'Element',
  'Node',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLFormElement',
  'HTMLIFrameElement',
  'ShadowRoot',
  'XPathResult',
])
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: name === 'window' ? dom.window : dom.window[name],
  })
const scopes = require('next/dist/experimental/testing/client/async-context')
const api = require('next/dist/experimental/testing/client/browser-context')
const mode = process.argv[2]
assert(
  [
    'same',
    'distinct',
    'undefined',
    'repeat',
    'component-only',
    'keyboard-only',
    'component-observer',
    'keyboard-observer',
    'capture-observer',
    'context-observer',
    'context-observer-same',
    'context-getter',
    'call-failure',
    'component-async-observer',
    'component-async-reject',
    'absent-observer',
  ].includes(mode)
)
const shared = new Error('same actual cleanup failure'),
  observer =
    mode === 'context-observer-same'
      ? shared
      : new Error('independent observer failure')
const componentError = mode === 'undefined' ? undefined : shared
const keyboardError =
  mode === 'undefined'
    ? undefined
    : mode === 'distinct'
      ? new Error('distinct keyboard failure')
      : shared
const trace = [],
  componentTokens = [],
  keyboardTokens = [],
  notifications = []
let held = false,
  nativeCleanups = 0,
  left = false
const binding = api.initializeBrowserContext(async (command) => {
  if (command.method === 'keyboard') {
    held = true
    return { unreleased: ['Shift'] }
  }
  assert.equal(command.method, 'keyboardCleanup')
  nativeCleanups++
  held = false
  trace.push('native-keyboard-cleanup')
})
const collection = scopes.createAsyncScope(
  {
    kind: 'collection',
    context: { id: 'context-failure', name: 'context-failure' },
  },
  () => {}
)
const hook = collection.run(() =>
  scopes.createAsyncScope(
    {
      kind: 'hook',
      context: { id: 'hook', suiteId: 'context-failure', name: 'hook' },
    },
    () => {}
  )
)
const leave = scopes.enterCreatorScope(
  hook.run(() => scopes.captureCreatorScope())
)
const cleanupDescriptor = Object.getOwnPropertyDescriptor(
    api.userEvent,
    'cleanup'
  ),
  key = Symbol.for('vitest:component-cleanup'),
  componentDescriptor = Object.getOwnPropertyDescriptor(api.page, key)
const realCleanup = api.userEvent.cleanup
const observation = {
  onComponentFailure(token) {
    assert.equal(this, observation)
    componentTokens.push(token)
    if (mode === 'component-observer') throw observer
    if (
      mode === 'component-async-observer' ||
      mode === 'component-async-reject'
    )
      return Promise.resolve().then(() => {
        trace.push('component-observation-end')
        if (mode === 'component-async-reject') throw observer
      })
  },
  captureKeyboardError(error) {
    if (mode === 'capture-observer') throw observer
    return { error }
  },
  onKeyboardCleanup(outcome) {
    keyboardTokens.push(outcome)
    if (mode === 'keyboard-observer') throw observer
  },
  onContextCleanupFailure(token) {
    notifications.push(token)
    if (mode === 'context-observer' || mode === 'context-observer-same')
      throw observer
  },
}
if (mode === 'context-getter')
  Object.defineProperty(observation, 'onContextCleanupFailure', {
    get() {
      throw observer
    },
  })
async function main() {
  try {
    await api.userEvent.keyboard('{Shift>}')
    leave()
    left = true
    hook.close()
    collection.close()
    api.page[key] = function () {
      assert.equal(this, api.page)
      trace.push('component')
      if (mode === 'absent-observer')
        queueMicrotask(() => trace.push('component-microtask'))
      if (mode !== 'keyboard-only') throw componentError
    }
    Object.defineProperty(api.userEvent, 'cleanup', {
      configurable: true,
      get() {
        if (mode === 'call-failure') throw keyboardError
        return function () {
          assert.equal(this, api.userEvent)
          trace.push('keyboard')
          return Reflect.apply(realCleanup, this, []).then(() => {
            if (mode !== 'component-only') throw keyboardError
          })
        }
      },
    })
    const caught = []
    for (let i = 0; i < (mode === 'repeat' ? 2 : 1); i++) {
      const value = await api
        .cleanupBrowserContext(
          mode === 'absent-observer' ? undefined : observation
        )
        .then(
          () => ({ status: 'fulfilled' }),
          (error) => ({ status: 'rejected', error })
        )
      assert.equal(value.status, 'rejected')
      caught.push(value.error)
    }
    const eligible = [
      'same',
      'distinct',
      'undefined',
      'repeat',
      'component-async-observer',
    ].includes(mode)
    if (eligible) {
      assert.equal(notifications.length, caught.length)
      for (let i = 0; i < caught.length; i++) {
        assert(caught[i] instanceof AggregateError)
        assert.equal(notifications[i].error, caught[i])
        assert.equal(notifications[i].component, componentTokens[i])
        assert.equal(notifications[i].keyboard, keyboardTokens[i])
        assert.equal(keyboardTokens[i].ownership, 'cleanup')
        assert.deepEqual(caught[i].errors, [componentError, keyboardError])
        assert(Object.isFrozen(notifications[i]))
        assert(Object.isFrozen(componentTokens[i]))
        assert(Object.isFrozen(keyboardTokens[i]))
      }
      if (mode === 'repeat') {
        assert.notEqual(notifications[0], notifications[1])
        assert.notEqual(componentTokens[0], componentTokens[1])
        assert.notEqual(keyboardTokens[0], keyboardTokens[1])
      }
    } else if (
      mode === 'context-observer' ||
      mode === 'context-observer-same'
    ) {
      assert.equal(notifications.length, 1)
      assert.notEqual(notifications[0].error, caught[0])
      assert.deepEqual(caught[0].errors, [
        componentError,
        keyboardError,
        observer,
      ])
    } else {
      assert.equal(notifications.length, 0)
      if (mode === 'absent-observer') {
        assert.deepEqual(caught[0].errors, [componentError, keyboardError])
        assert(trace.indexOf('keyboard') < trace.indexOf('component-microtask'))
      } else if (mode === 'component-only')
        assert.equal(caught[0], componentError)
      else if (mode === 'keyboard-only') assert.equal(caught[0], keyboardError)
      else if (
        mode === 'component-observer' ||
        mode === 'component-async-reject' ||
        mode === 'context-getter'
      )
        assert.deepEqual(caught[0].errors, [
          componentError,
          ...(['component-observer', 'component-async-reject'].includes(mode)
            ? [observer, keyboardError]
            : [keyboardError, observer]),
        ])
      else if (mode === 'call-failure') {
        assert.deepEqual(caught[0].errors, [componentError, keyboardError])
        assert.equal(keyboardTokens[0].ownership, 'call')
      } else {
        assert(caught[0].errors[1] instanceof AggregateError)
        assert.deepEqual(caught[0].errors[1].errors, [keyboardError, observer])
      }
    }
    if (
      mode === 'component-async-observer' ||
      mode === 'component-async-reject'
    )
      assert(
        trace.indexOf('component-observation-end') < trace.indexOf('keyboard')
      )
    assert.equal(nativeCleanups, mode === 'call-failure' ? 0 : 1)
    assert.equal(held, mode === 'call-failure')
    assert.equal(
      trace.filter((x) => x === 'component').length,
      mode === 'repeat' ? 2 : 1
    )
    console.log(
      JSON.stringify({
        mode,
        actualJoinedPairOnly: true,
        exactTokenIdentityAndOrder: true,
        independentObserverAndCallFailuresHeld: true,
        sameErrorOccurrencesNotDeduplicated: true,
        remainingCleanupAttempted: true,
      })
    )
  } finally {
    if (!left) leave()
    hook.close()
    collection.close()
    Object.defineProperty(api.userEvent, 'cleanup', cleanupDescriptor)
    if (componentDescriptor)
      Object.defineProperty(api.page, key, componentDescriptor)
    else delete api.page[key]
    binding.dispose()
    dom.window.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
