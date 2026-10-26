const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const provider = createRequire(require.resolve('jest-environment-jsdom'))
const { JSDOM } = require(provider.resolve('jsdom'))
const mode = process.argv[2]
assert(
  [
    'normal',
    'sole',
    'undefined',
    'legacy',
    'repeat',
    'observer-error',
    'observer-getter-error',
    'same-component',
    'distinct-component',
    'component-only',
    'fulfilled-observer-error',
  ].includes(mode)
)
const dom = new JSDOM('<!DOCTYPE html><body></body>')
const names = [
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
]
const saved = new Map(
  names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
)
for (const name of names)
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: name === 'window' ? dom.window : dom.window[name],
  })
const scopes = require('next/dist/experimental/testing/client/async-context'),
  api = require('next/dist/experimental/testing/client/browser-context')
const late = [],
  trace = [],
  observed = [],
  componentError = new Error('actual component failure'),
  observerError = new Error('actual keyboard observer failure')
const keyboardError =
  mode === 'undefined'
    ? undefined
    : mode === 'same-component'
      ? componentError
      : new Error('actual keyboard failure')
const keyboardFails = ![
  'normal',
  'component-only',
  'fulfilled-observer-error',
].includes(mode)
const componentFails = [
  'same-component',
  'distinct-component',
  'component-only',
].includes(mode)
const hook = scopes.createAsyncScope(
  {
    kind: 'hook',
    context: {
      id: 'keyboard-hook',
      suiteId: 'keyboard-observation',
      name: 'keyboard-hook',
    },
  },
  (error) => late.push(error)
)
const leave = scopes.enterCreatorScope(
  hook.run(() => scopes.captureCreatorScope())
)
const binding = api.initializeBrowserContext(async (command) => {
  if (command.method === 'keyboard') return { unreleased: ['Shift'] }
  assert.equal(command.method, 'keyboardCleanup')
  trace.push('keyboard')
  if (keyboardFails) throw keyboardError
  return null
})
let observerReads = 0
const observation = {
  onComponentFailure(occurrence) {
    assert.equal(occurrence.error, componentError)
    trace.push('component-observed')
  },
  onKeyboardCleanup(outcome) {
    assert.equal(this, observation)
    assert(Object.isFrozen(outcome))
    assert.equal(outcome.status, keyboardFails ? 'rejected' : 'fulfilled')
    assert.equal(Object.hasOwn(outcome, 'error'), keyboardFails)
    if (keyboardFails) assert.equal(outcome.error, keyboardError)
    observed.push(outcome)
    trace.push('keyboard-observed')
    if (mode === 'observer-error' || mode === 'fulfilled-observer-error')
      throw observerError
  },
}
if (mode === 'observer-getter-error')
  Object.defineProperty(observation, 'onKeyboardCleanup', {
    get() {
      observerReads++
      throw observerError
    },
  })
const symbol = Symbol.for('vitest:component-cleanup')
async function main() {
  try {
    api.page[symbol] = function () {
      assert.equal(this, api.page)
      trace.push('component')
      if (componentFails) throw componentError
    }
    const count = mode === 'repeat' ? 2 : 1
    for (let index = 0; index < count; index++) {
      await api.userEvent.keyboard('{Shift>}')
      const result = await api
        .cleanupBrowserContext(mode === 'legacy' ? undefined : observation)
        .then(
          () => ({ status: 'fulfilled' }),
          (error) => ({ status: 'rejected', error })
        )
      assert.equal(result.status, mode === 'normal' ? 'fulfilled' : 'rejected')
      if (componentFails && keyboardFails) {
        assert(result.error instanceof AggregateError)
        assert.deepEqual(result.error.errors, [componentError, keyboardError])
      } else if (
        mode === 'observer-error' ||
        mode === 'observer-getter-error'
      ) {
        assert(result.error instanceof AggregateError)
        assert.deepEqual(result.error.errors, [keyboardError, observerError])
      } else if (mode !== 'normal')
        assert.equal(
          result.error,
          mode === 'component-only'
            ? componentError
            : mode === 'fulfilled-observer-error'
              ? observerError
              : keyboardError
        )
    }
    assert.equal(
      observed.length,
      mode === 'legacy' || mode === 'observer-getter-error' ? 0 : count
    )
    if (mode === 'repeat') assert.notEqual(observed[0], observed[1])
    assert.equal(observerReads, mode === 'observer-getter-error' ? 1 : 0)
    assert.equal(trace.filter((value) => value === 'keyboard').length, count)
    assert.equal(late.length, 0)
    process.stdout.write(
      JSON.stringify({
        mode,
        actualKeyboardOutcome: true,
        undefinedRejectionDistinct: true,
        freshOutcomePerInvocation: true,
        originalAndObserverFailuresRetained: true,
        componentThenKeyboardOrderHeld: true,
      }) + '\n'
    )
  } finally {
    delete api.page[symbol]
    binding.dispose()
    hook.close()
    leave()
    dom.window.close()
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
}
main().catch((error) => {
  process.stderr.write(String(error?.stack ?? error) + '\n')
  process.exitCode = 1
})
