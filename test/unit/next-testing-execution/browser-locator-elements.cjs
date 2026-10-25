const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const req = require
const provider = createRequire(req.resolve('jest-environment-jsdom'))
const { JSDOM } = req(provider.resolve('jsdom'))
const mode = process.argv[2]
assert(
  [
    'missing',
    'strict',
    'identity',
    'detached',
    'closed',
    'foreign',
    'late-action',
    'detached-action',
  ].includes(mode)
)
const dom = new JSDOM('<!DOCTYPE html><body></body>')
const names = [
  'window',
  'document',
  'Element',
  'Node',
  'HTMLElement',
  'SVGElement',
  'HTMLFormElement',
  'HTMLIFrameElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
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
const client = req('next/dist/experimental/testing/client/async-context')
const api = req('next/dist/experimental/testing/client/browser-context')
const late = [],
  commands = []
const scope = client.createAsyncScope(
  {
    kind: 'attempt',
    context: { id: 'element', fileId: 'file', testId: 'case' },
  },
  (error) => late.push(error)
)
const cell = scope.run(() => client.captureCreatorScope())
let leave = client.enterCreatorScope(cell),
  finish
const binding = api.initializeBrowserContext((command) => {
  commands.push(command)
  return mode === 'late-action'
    ? new Promise((resolve) => {
        finish = resolve
      })
    : Promise.resolve(null)
})
function button(name) {
  const element = document.createElement('button')
  element.textContent = name
  document.body.append(element)
  return element
}
function caught(callback) {
  try {
    callback()
  } catch (error) {
    return error
  }
  throw Error('Expected actual error')
}
function lookup(id) {
  leave()
  try {
    return globalThis[Symbol.for('next.testing.browser.locators')](document, id)
  } finally {
    leave = client.enterCreatorScope(cell)
  }
}
async function main() {
  try {
    if (mode === 'missing') {
      document.body.innerHTML =
        '<main><p>Visible text</p><label>Existing<input aria-label="Actual"></label></main>'
      const locator = api.page.getByRole('button', {
        name: 'Missing',
        exact: true,
      })
      assert.equal(locator.query(), null)
      const error = caught(() => locator.element())
      assert.equal(error.constructor, Error)
      assert.equal(error.name, 'VitestBrowserElementError')
      assert.deepEqual(Object.keys(error), ['name'])
      assert.match(
        error.message,
        /Cannot find element with locator: getByRole\('button', \{ name: 'Missing' \}\)/
      )
      assert.match(error.message, /ARIA tree:\n- main:/)
      assert.match(error.message, /textbox "Actual"/)
      assert.match(error.message, /HTML:/)
      assert.equal(commands.length, 0)
    } else if (mode === 'strict') {
      button('Duplicate')
      button('Duplicate')
      const locator = api.page.getByRole('button', {
        name: 'Duplicate',
        exact: true,
      })
      const query = caught(() => locator.query()),
        element = caught(() => locator.element())
      assert.equal(query.name, 'Error')
      assert.equal(element.message, query.message)
      assert.equal(locator.elements().length, 2)
      assert.equal(
        query.message,
        "strict mode violation: getByRole('button', { name: 'Duplicate' }) resolved to 2 elements:\n    1) <button>Duplicate</button> aka getByRole('button', { name: 'Duplicate', exact: false }).first()\n    2) <button>Duplicate</button> aka getByRole('button', { name: 'Duplicate', exact: false }).nth(1)\n"
      )
    } else if (mode === 'identity') {
      const target = button('Actual'),
        locator = api.page.getByRole('button', { name: 'Actual', exact: true })
      assert.equal(locator.query(), target)
      assert.equal(locator.element(), target)
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('role', 'img')
      svg.setAttribute('aria-label', 'Drawing')
      document.body.append(svg)
      const drawing = api.page.getByRole('img', {
        name: 'Drawing',
        exact: true,
      })
      assert.equal(drawing.query(), svg)
      assert.equal(drawing.element(), svg)
    } else if (mode === 'detached') {
      const target = button('Bound'),
        locator = api.page.elementLocator(target)
      assert.equal(locator.element(), target)
      target.remove()
      document.body.textContent = 'Other current content'
      assert.equal(locator.query(), null)
      const error = caught(() => locator.element())
      assert.equal(error.name, 'VitestBrowserElementError')
      assert.match(error.message, /Bound/)
      assert.doesNotMatch(error.message, /Other current content/)
    } else if (mode === 'closed') {
      const locator = api.page.getByRole('button', {
        name: 'Missing',
        exact: true,
      })
      scope.close()
      const query = caught(() => locator.query()),
        element = caught(() => locator.element())
      assert.match(query.message, /closed attempt scope/)
      assert.match(element.message, /closed attempt scope/)
      assert.notEqual(element.name, 'VitestBrowserElementError')
      assert.deepEqual(late, [query, element])
      assert.equal(commands.length, 0)
    } else if (mode === 'foreign') {
      const foreign = document.implementation.createHTMLDocument('foreign'),
        target = foreign.createElement('button')
      foreign.body.append(target)
      const error = caught(() => api.page.elementLocator(target))
      assert.match(error.message, /must belong to its owned document/)
      assert.equal(commands.length, 0)
    } else if (mode === 'detached-action') {
      const target = button('Raw')
      target.remove()
      assert.equal(api.page.elementLocator(target).query(), null)
      const action = api.userEvent.click(target)
      assert(action instanceof Promise)
      await assert.rejects(action, /not attached to its document/)
      assert.equal(commands.length, 0)
    } else {
      const locator = api.page.getByRole('button', {
        name: 'Late',
        exact: true,
      })
      assert.equal(locator.query(), null)
      assert.equal(
        caught(() => locator.element()).name,
        'VitestBrowserElementError'
      )
      const action = locator.click({ timeout: 50 })
      assert.equal(commands.length, 1)
      const id = commands[0].element
      assert.match(id, /^next-test-locator-/)
      assert.deepEqual(lookup(id), [])
      const target = button('Late')
      assert.equal(locator.element(), target)
      assert.deepEqual(lookup(id), [target])
      finish(null)
      await action
      assert.deepEqual(lookup(id), [])
    }
    if (mode !== 'closed') assert.deepEqual(late, [])
    console.log(JSON.stringify({ mode, passed: true }))
  } finally {
    finish?.(null)
    await api.cleanupBrowserContext()
    binding.dispose()
    leave()
    scope.close()
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
    dom.window.close()
  }
}
main().catch((error) => {
  console.error(error.stack)
  process.exitCode = 1
})
