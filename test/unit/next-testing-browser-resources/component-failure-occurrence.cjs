const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const provider = createRequire(require.resolve('jest-environment-jsdom'))
const { JSDOM } = require(provider.resolve('jsdom'))
const mode = process.argv[2]
assert(
  [
    'normal',
    'sole',
    'legacy',
    'repeat',
    'observer-error',
    'observer-getter-error',
    'same-keyboard',
    'distinct-keyboard',
    'keyboard-only',
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
  componentError = new Error('actual component failure'),
  observerError = new Error('actual observer failure'),
  keyboardError =
    mode === 'same-keyboard'
      ? componentError
      : new Error('actual keyboard failure')
const collection = scopes.createAsyncScope(
  {
    kind: 'collection',
    context: { id: 'component-observation', name: 'component-observation' },
  },
  (error) => late.push(error)
)
const hook = scopes.createAsyncScope(
  {
    kind: 'hook',
    context: {
      id: 'component-hook',
      name: 'component-hook',
      suiteId: 'component-observation',
    },
  },
  (error) => late.push(error)
)
const binding = api.initializeBrowserContext(async (command) => {
  if (command.method === 'keyboard') return { unreleased: ['Shift'] }
  assert.equal(command.method, 'keyboardCleanup')
  trace.push('keyboard')
  if (['same-keyboard', 'distinct-keyboard', 'keyboard-only'].includes(mode))
    throw keyboardError
  return null
})
const cell = hook.run(() => scopes.captureCreatorScope()),
  leave = scopes.enterCreatorScope(cell),
  symbol = Symbol.for('vitest:component-cleanup'),
  observed = []
let reads = 0,
  observerReads = 0
const observation = {
  onComponentFailure(occurrence) {
    assert.equal(this, observation)
    assert(Object.isFrozen(occurrence))
    assert.equal(occurrence.error, componentError)
    observed.push(occurrence)
    trace.push('observe')
    if (mode === 'observer-error') throw observerError
  },
}
if (mode === 'observer-getter-error' || mode === 'keyboard-only')
  Object.defineProperty(observation, 'onComponentFailure', {
    get() {
      observerReads++
      throw observerError
    },
  })
async function main() {
  try {
    Object.defineProperty(api.page, symbol, {
      configurable: true,
      get() {
        reads++
        return function () {
          assert.equal(this, api.page)
          trace.push('component')
          if (!['normal', 'keyboard-only'].includes(mode)) throw componentError
        }
      },
    })
    const count = mode === 'repeat' ? 2 : 1
    for (let i = 0; i < count; i++) {
      await api.userEvent.keyboard('{Shift>}')
      const error = await api
        .cleanupBrowserContext(mode === 'legacy' ? undefined : observation)
        .then(
          () => undefined,
          (error) => error
        )
      if (['same-keyboard', 'distinct-keyboard'].includes(mode)) {
        assert(error instanceof AggregateError)
        assert.deepEqual(error.errors, [componentError, keyboardError])
      } else if (
        mode === 'observer-error' ||
        mode === 'observer-getter-error'
      ) {
        assert(error instanceof AggregateError)
        assert.deepEqual(error.errors, [componentError, observerError])
      } else
        assert.equal(
          error,
          mode === 'normal'
            ? undefined
            : mode === 'keyboard-only'
              ? keyboardError
              : componentError
        )
    }
    assert.equal(reads, count)
    assert.equal(observerReads, mode === 'observer-getter-error' ? 1 : 0)
    assert.equal(
      observed.length,
      ['normal', 'legacy', 'keyboard-only', 'observer-getter-error'].includes(
        mode
      )
        ? 0
        : count
    )
    if (mode === 'repeat') assert.notEqual(observed[0], observed[1])
    assert.equal(trace.filter((value) => value === 'keyboard').length, count)
    assert.equal(late.length, 0)
    process.stdout.write(
      JSON.stringify({
        mode,
        actualComponentCatch: true,
        freshOccurrencePerCall: true,
        observerReceiverHeld: true,
        originalAndObserverFailuresRetained: true,
        allRemainingCleanupAttempted: true,
      }) + '\n'
    )
  } finally {
    delete api.page[symbol]
    binding.dispose()
    collection.close()
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
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
