const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const provider = createRequire(require.resolve('jest-environment-jsdom'))
const { JSDOM } = require(provider.resolve('jsdom'))
const mode = process.argv[2]
assert(
  ['normal', 'component-error', 'getter-error', 'noncallable'].includes(mode)
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
const scopes = require('next/dist/experimental/testing/client/async-context')
const api = require('next/dist/experimental/testing/client/browser-context')
const late = [],
  trace = [],
  failure = new Error('actual component cleanup failed')
const collection = scopes.createAsyncScope(
  {
    kind: 'collection',
    context: { id: 'component-file', name: 'component-file' },
  },
  (error) => late.push(error)
)
const hook = scopes.createAsyncScope(
  {
    kind: 'hook',
    context: {
      id: 'component-hook',
      name: 'component-hook',
      suiteId: 'component-file',
    },
  },
  (error) => late.push(error)
)
let reads = 0,
  methodReads = 0
const symbol = Symbol.for('vitest:component-cleanup')
const binding = api.initializeBrowserContext(async (command) => {
  trace.push(command.method)
  if (command.method === 'keyboard') return { unreleased: ['Shift'] }
  assert.equal(command.method, 'keyboardCleanup')
  assert.deepEqual(command.args, [['Shift']])
  return null
})
const cell = hook.run(() => scopes.captureCreatorScope())
const leave = scopes.enterCreatorScope(cell)
async function main() {
  try {
    collection.run(() => {
      const inherited = {
        inheritedMethod: function inheritedMethod(value) {
          return [this === api.page, value]
        },
      }
      const methods = Object.create(inherited)
      Object.defineProperty(methods, 'ownMethod', {
        enumerable: true,
        get() {
          methodReads++
          return function namedMethod(a, b) {
            return [this === api.page, a, b]
          }
        },
      })
      methods[symbol] = () => {
        throw new Error('extended Symbol must be ignored')
      }
      assert.equal(api.page.extend(methods), api.page)
      assert.equal(methodReads, 1)
      assert.deepEqual(api.page.inheritedMethod(3), [true, 3])
      const held = api.page.ownMethod
      assert.deepEqual(held.call({ foreign: true }, 1, 2), [true, 1, 2])
      assert.equal(held.name, 'bound namedMethod')
      assert.equal(held.length, 2)
      assert.deepEqual(Object.getOwnPropertyNames(held), ['length', 'name'])
      assert.equal(symbol in api.page, false)
    })
    Object.defineProperty(api.page, symbol, {
      configurable: true,
      get() {
        reads++
        if (mode === 'getter-error') throw failure
        if (mode === 'noncallable') return 42
        return function componentCleanup() {
          assert.equal(this, api.page)
          trace.push('component')
          if (mode === 'component-error') throw failure
        }
      },
    })
    await api.userEvent.keyboard('{Shift>}')
    trace.length = 0
    const error = await api.cleanupBrowserContext().then(
      () => undefined,
      (error) => error
    )
    assert.equal(reads, 1)
    assert.deepEqual(trace, [
      ...(['normal', 'component-error'].includes(mode) ? ['component'] : []),
      'keyboardCleanup',
    ])
    if (mode === 'noncallable') assert(error instanceof TypeError)
    else assert.equal(error, mode === 'normal' ? undefined : failure)
    assert.equal(late.length, 0)
    process.stdout.write(
      JSON.stringify({
        mode,
        inheritedGetterAndBoundExtension: true,
        ignoredExtensionSymbols: true,
        directSymbolReceiverAndReadCount: true,
        componentBeforeKeyboard: true,
        keyboardAttemptedAfterComponentFailure: true,
        originalErrorRetained: true,
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
