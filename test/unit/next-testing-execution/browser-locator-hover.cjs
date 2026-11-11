const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const provider = createRequire(require.resolve('jest-environment-jsdom'))
const { JSDOM } = require(provider.resolve('jsdom'))
const [method, mode] = process.argv.slice(2)
assert(['hover', 'unhover'].includes(method))
assert(['success', 'native-error'].includes(mode))
const context = require('next/dist/experimental/testing/client/async-context')
const api = require('next/dist/experimental/testing/client/browser-context')
const key = Symbol.for('next.testing.browser.locators')
const dom = new JSDOM('<!DOCTYPE html><body></body>')
const restoreBrowserDomRealm = require('./browser-dom-realm.cjs')(dom.window)
const saved = new Map(
  ['document', 'Element'].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ])
)
for (const [name, value] of [
  ['document', dom.window.document],
  ['Element', dom.window.Element],
])
  Object.defineProperty(globalThis, name, { configurable: true, value })
const late = [],
  commands = []
const scope = context.createAsyncScope(
  { kind: 'attempt', context: { id: 'hover', fileId: 'file', testId: 'case' } },
  (error) => late.push(error)
)
const cell = scope.run(() => context.captureCreatorScope())
let leave = context.enterCreatorScope(cell),
  resolve,
  reject
const gate = new Promise((yes, no) => {
  resolve = yes
  reject = no
})
const binding = api.initializeBrowserContext((command) => {
  commands.push(command)
  return commands.length === 1 ? gate : Promise.resolve(null)
})
function lookup(root, id) {
  leave()
  try {
    return globalThis[key](root, id)
  } finally {
    leave = context.enterCreatorScope(cell)
  }
}
;(async () => {
  try {
    const pending = api.page
      .getByRole('button', { name: 'Late', exact: true })
      [method]({ timeout: 50 })
      .then(
        (value) => ({ value }),
        (error) => ({ error })
      )
    assert.equal(commands.length, 1)
    const command = commands[0]
    assert.match(command.element, /^next-test-locator-\d+$/)
    assert.equal(command.method, method)
    assert.deepEqual(command.args, [{ timeout: 50 }])
    assert.deepEqual(lookup(document, command.element), [])
    assert.deepEqual(
      lookup(
        document.implementation.createHTMLDocument('foreign'),
        command.element
      ),
      []
    )
    const target = document.createElement('button')
    target.textContent = 'Late'
    document.body.append(target)
    let syntheticEvents = 0
    for (const name of ['pointerover', 'pointerout', 'mouseover', 'mouseout'])
      target.addEventListener(name, () => syntheticEvents++)
    assert.deepEqual(lookup(document, command.element), [target])
    const original = new Error('actual native hover failure')
    if (mode === 'native-error') reject(original)
    else resolve(null)
    const result = await pending
    if (mode === 'native-error') assert.equal(result.error, original)
    else assert.equal(result.value, undefined)
    assert.deepEqual(lookup(document, command.element), [])
    await api.userEvent.click(target)
    assert.match(commands.at(-1).element, /^next-test-element-\d+$/)
    assert.equal(syntheticEvents, 0)
    assert.deepEqual(late, [])
    await api.cleanupBrowserContext()
    binding.dispose()
    assert.equal(globalThis[key], undefined)
    console.log(
      JSON.stringify({
        method,
        mode,
        capturedScope: true,
        liveIdentity: true,
        foreignRootRefused: true,
        originalErrorRetained: true,
        followingAction: true,
        callbackReleased: true,
        noSyntheticEvents: true,
      })
    )
  } finally {
    resolve(null)
    binding.dispose()
    scope.close()
    leave()
    dom.window.close()
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
    restoreBrowserDomRealm()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
