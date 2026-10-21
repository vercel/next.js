const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const provider = createRequire(require.resolve('jest-environment-jsdom'))
const { JSDOM } = require(provider.resolve('jsdom'))
const mode = process.argv[2]
const family = process.argv[3]
if (family !== undefined) assert(['dblClick', 'tripleClick'].includes(family))
assert(
  [
    'click',
    'fill',
    'duplicates',
    'parallel',
    'action-error',
    'closed-scope',
    'cleanup-held',
    'dispose-held',
    'present-and-detached',
  ].includes(mode)
)
const client = require('next/dist/experimental/testing/client/async-context')
const api = require('next/dist/experimental/testing/client/browser-context')
const key = Symbol.for('next.testing.browser.locators')
const dom = new JSDOM('<!DOCTYPE html><body></body>')
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
  commands = [],
  gates = []
const failure = new Error('actual native locator failed')
const scope = client.createAsyncScope(
  {
    kind: 'attempt',
    context: { id: 'locator', fileId: 'file', testId: 'case' },
  },
  (error) => late.push(error)
)
const cell = scope.run(() => client.captureCreatorScope())
let leave = client.enterCreatorScope(cell)
function lookup(root, id) {
  leave()
  try {
    return globalThis[key](root, id)
  } finally {
    leave = client.enterCreatorScope(cell)
  }
}
const binding = api.initializeBrowserContext((command) => {
  commands.push(command)
  if (
    mode === 'present-and-detached' ||
    commands.length > (mode === 'parallel' ? 2 : 1)
  )
    return Promise.resolve(null)
  return new Promise((resolve, reject) => gates.push({ resolve, reject }))
})
const settle = (promise) =>
  promise.then(
    (value) => ({ value }),
    (error) => ({ error })
  )
const tick = () => new Promise((resolve) => setImmediate(resolve))
let syntheticEvents = 0
document.addEventListener('click', () => syntheticEvents++)
document.addEventListener('input', () => syntheticEvents++)
function target() {
  const element = document.createElement(mode === 'fill' ? 'input' : 'button')
  if (mode === 'fill') element.setAttribute('aria-label', 'Pending')
  else element.textContent = 'Pending'
  document.body.append(element)
  return element
}
async function main() {
  try {
    const query =
      mode === 'fill'
        ? api.page.getByLabelText('Pending')
        : api.page.getByRole('button', { name: 'Pending', exact: true })
    if (mode === 'present-and-detached') {
      const element = target()
      await query.click()
      assert.match(commands[0].element, /^next-test-element-\d+$/)
      assert.deepEqual(lookup(document, 'next-test-locator-1000'), [])
      element.remove()
      await assert.rejects(api.userEvent.click(element), /not attached/)
      await assert.rejects(
        api.page.getByRole('button', { name: 'Missing' }).clear(),
        /not attached/
      )
      assert.equal(commands.length, 1)
    } else {
      const result = settle(
        family
          ? query[family]({ timeout: 50 })
          : mode === 'fill'
            ? query.fill('value', { timeout: 50 })
            : query.click({ timeout: 50 })
      )
      assert.equal(commands.length, 1)
      const id = commands[0].element
      assert.match(id, /^next-test-locator-\d+$/)
      assert.equal(
        commands[0].method,
        family ?? (mode === 'fill' ? 'fill' : 'click')
      )
      assert.deepEqual(
        commands[0].args,
        mode === 'fill' ? ['value', { timeout: 50 }] : [{ timeout: 50 }]
      )
      assert.deepEqual(lookup(document, id), [])
      const foreign = document.implementation.createHTMLDocument('foreign')
      assert.deepEqual(lookup(foreign, id), [])
      let second
      if (mode === 'parallel') {
        second = settle(query.click({ timeout: 50 }))
        assert.equal(commands.length, 2)
        assert.notEqual(commands[1].element, id)
      }
      const element = target()
      assert.deepEqual(lookup(document, id), [element])
      if (mode === 'duplicates') {
        const duplicate = target()
        assert.deepEqual(lookup(document, id), [element, duplicate])
      }
      if (mode === 'parallel') {
        assert.deepEqual(lookup(document, commands[1].element), [element])
        gates[0].resolve(null)
        assert.equal((await result).value, undefined)
        assert.deepEqual(lookup(document, id), [])
        assert.deepEqual(lookup(document, commands[1].element), [element])
        gates[1].resolve(null)
        assert.equal((await second).value, undefined)
      } else if (mode === 'closed-scope') {
        scope.close()
        let rejected
        try {
          lookup(document, id)
        } catch (error) {
          rejected = error
        }
        assert.match(rejected.message, /closed attempt scope/)
        assert.equal(late[0], rejected)
        gates[0].reject(rejected)
        assert.equal((await result).error, rejected)
      } else if (mode === 'dispose-held') {
        binding.dispose()
        let rejected
        try {
          lookup(document, id)
        } catch (error) {
          rejected = error
        }
        assert.match(rejected.message, /transport has closed/)
        gates[0].reject(rejected)
        assert.equal((await result).error, rejected)
        assert.equal(globalThis[key], undefined)
      } else if (mode === 'action-error') {
        gates[0].reject(failure)
        assert.equal((await result).error, failure)
      } else {
        let cleanup,
          cleaned = false
        if (mode === 'cleanup-held') {
          cleanup = api.cleanupBrowserContext().then(() => {
            cleaned = true
          })
          await tick()
          assert.equal(cleaned, false)
          assert.deepEqual(lookup(document, id), [element])
        }
        gates[0].resolve(null)
        assert.equal((await result).value, undefined)
        if (cleanup) {
          await cleanup
          assert.equal(cleaned, true)
        }
      }
      if (mode !== 'dispose-held') assert.deepEqual(lookup(document, id), [])
    }
    assert.equal(syntheticEvents, 0)
    if (!['closed-scope', 'dispose-held'].includes(mode)) {
      const existing = document.querySelector('button,input') ?? target()
      if (existing.tagName === 'INPUT')
        await api.page.getByLabelText('Pending').fill('healthy')
      else await api.userEvent.click(existing)
      assert.match(commands.at(-1).element, /^next-test-element-\d+$/)
      await api.cleanupBrowserContext()
    }
    binding.dispose()
    assert.equal(globalThis[key], undefined)
    process.stdout.write(
      JSON.stringify({
        mode,
        commands,
        originalScopesRetained: true,
        foreignRootRefused: true,
        callbacksReleased: true,
        originalErrorRetained: true,
        cleanupJoined: true,
        noSyntheticEvents: true,
      }) + '\n'
    )
  } finally {
    for (const gate of gates) gate.resolve(null)
    binding.dispose()
    scope.close()
    leave()
    dom.window.close()
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
