'use strict'
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
const mode = process.argv[2],
  late = [],
  commands = [],
  task = { type: 'test', id: 'file/0', onFinished: [] }
const collection = scopes.createAsyncScope(
  { kind: 'collection', context: { id: 'file', name: 'file' } },
  (error) => late.push(error)
)
const hook = collection.run(() =>
  scopes.createAsyncScope(
    { kind: 'hook', context: { id: 'hook', suiteId: 'file', name: 'hook' } },
    (error) => late.push(error)
  )
)
const leave = scopes.enterCreatorScope(
  hook.run(() => scopes.captureCreatorScope())
)
const legacy =
  mode === 'legacy' || mode === 'legacy-lazy' || mode === 'legacy-construction'
const binding = api.initializeBrowserContext(
  (value) => {
    commands.push(value)
    return Promise.resolve()
  },
  {
    getConsoleTask() {
      return task
    },
  },
  legacy ? undefined : { serializedClickTargets: true }
)
const descriptor = Object.getOwnPropertyDescriptor(api.page, 'elementLocator')
async function run() {
  const root = document.createElement('section')
  root.id = 'initial-root'
  root.innerHTML = '<button data-testid="target">Inside</button>'
  const outside = document.createElement('button')
  outside.dataset.testid = 'target'
  document.body.append(outside)
  if (mode !== 'detached' && mode !== 'legacy-lazy') document.body.append(root)
  try {
    if (mode === 'eager') {
      let reads = 0,
        calls = 0
      Object.defineProperty(api.page, 'elementLocator', {
        configurable: true,
        get() {
          reads++
          assert.equal(this, api.page)
          return function (value) {
            calls++
            assert.equal(this, api.page)
            assert.equal(value, root)
            return Reflect.apply(descriptor.value, this, arguments)
          }
        },
      })
      const selectors = api.utils.getElementLocatorSelectors(root)
      assert.equal(reads, 1)
      assert.equal(calls, 1)
      root.id = 'changed-root'
      const locator = selectors.getByTestId('target')
      assert.equal(
        locator.selector,
        '#initial-root >> internal:testid=[data-testid="target"s]'
      )
      assert.equal(commands.length, 0)
      await locator.click()
      assert.equal(commands.length, 1)
      assert.equal(commands[0].locator.selector, locator.selector)
      assert.equal('element' in commands[0], false)
      task.onFinished[0]()
    } else if (mode === 'delegation') {
      const fake = {},
        sentinel = {},
        trace = [],
        options = { exact: true },
        methods = [
          'getByAltText',
          'getByLabelText',
          'getByPlaceholder',
          'getByRole',
          'getByTestId',
          'getByText',
          'getByTitle',
        ]
      for (const method of methods)
        Object.defineProperty(fake, method, {
          get() {
            trace.push({ event: 'get', method, receiver: this === fake })
            return function () {
              trace.push({
                event: 'call',
                method,
                receiver: this === fake,
                args: Array.from(arguments),
              })
              return sentinel
            }
          },
        })
      let reads = 0,
        calls = 0
      Object.defineProperty(api.page, 'elementLocator', {
        configurable: true,
        get() {
          reads++
          return function (value) {
            calls++
            assert.equal(this, api.page)
            assert.equal(value, root)
            assert.equal(arguments.length, 1)
            return fake
          }
        },
      })
      const selectors = api.utils.getElementLocatorSelectors(root)
      assert.equal(reads, 1)
      assert.equal(calls, 1)
      assert.deepEqual(trace, [])
      for (const method of methods) {
        assert.equal(selectors[method].name, method)
        assert.equal(selectors[method].length, method === 'getByTestId' ? 1 : 2)
        assert.equal(
          selectors[method].call(
            { foreign: true },
            'subject',
            options,
            'ignored'
          ),
          sentinel
        )
      }
      assert.equal(trace.length, 14)
      for (let i = 0; i < methods.length; i++) {
        assert.deepEqual(trace[i * 2], {
          event: 'get',
          method: methods[i],
          receiver: true,
        })
        assert.deepEqual(trace[i * 2 + 1], {
          event: 'call',
          method: methods[i],
          receiver: true,
          args:
            methods[i] === 'getByTestId' ? ['subject'] : ['subject', options],
        })
      }
      assert.deepEqual(commands, [])
    } else if (mode === 'factory-error') {
      const marker = new Error('actual factory getter')
      let reads = 0
      Object.defineProperty(api.page, 'elementLocator', {
        configurable: true,
        get() {
          reads++
          throw marker
        },
      })
      assert.throws(
        () => api.utils.getElementLocatorSelectors(root),
        (error) => error === marker
      )
      assert.equal(reads, 1)
      assert.deepEqual(commands, [])
      assert.deepEqual(task.onFinished, [])
    } else if (mode === 'child-error') {
      const marker = new Error('actual child getter')
      let reads = 0
      const fake = {}
      Object.defineProperty(fake, 'getByTestId', {
        get() {
          reads++
          throw marker
        },
      })
      Object.defineProperty(api.page, 'elementLocator', {
        configurable: true,
        value() {
          return fake
        },
      })
      const selectors = api.utils.getElementLocatorSelectors(root)
      assert.equal(reads, 0)
      assert.throws(
        () => selectors.getByTestId('x'),
        (error) => error === marker
      )
      assert.equal(reads, 1)
      assert.deepEqual(commands, [])
    } else if (mode === 'detached') {
      assert.throws(() => api.utils.getElementLocatorSelectors(root))
      assert.deepEqual(commands, [])
      assert.deepEqual(task.onFinished, [])
    } else if (mode === 'legacy') {
      let reads = 0
      Object.defineProperty(api.page, 'elementLocator', {
        configurable: true,
        get() {
          reads++
          throw Error('legacy must not call new factory')
        },
      })
      const selectors = api.utils.getElementLocatorSelectors(root)
      root.id = 'changed-root'
      const locator = selectors.getByTestId('target')
      Object.defineProperty(locator, 'serialize', {
        get() {
          throw Error('legacy must not serialize')
        },
      })
      await locator.click()
      assert.equal(reads, 0)
      assert.equal(commands.length, 1)
      assert.equal('locator' in commands[0], false)
      assert.match(commands[0].element, /^next-test-element-[0-9]+$/)
      assert.equal(
        document.querySelector(
          '[data-next-test-element="' + commands[0].element + '"]'
        ),
        root.firstElementChild
      )
      task.onFinished[0]()
    } else if (mode === 'construction' || mode === 'legacy-construction') {
      const factory = api.utils.getElementLocatorSelectors
      assert.equal(factory.name, 'getElementLocatorSelectors')
      assert.equal(factory.length, 1)
      const prototype = Object.getOwnPropertyDescriptor(factory, 'prototype')
      assert.equal(prototype.enumerable, false)
      assert.equal(prototype.configurable, false)
      assert.equal(prototype.writable, true)
      assert.equal(prototype.value.constructor, factory)
      const selectors = Reflect.construct(factory, [root])
      const locator = selectors.getByTestId('target')
      assert.equal(
        locator.selector,
        legacy
          ? 'internal:testid=[data-testid="target"s]'
          : '#initial-root >> internal:testid=[data-testid="target"s]'
      )
      await locator.click()
      assert.equal(commands.length, 1)
      if (legacy) assert.equal('locator' in commands[0], false)
      else assert.equal(commands[0].locator.selector, locator.selector)
      task.onFinished[0]()
    } else if (mode === 'legacy-lazy') {
      const locator = api.page.elementLocator(root)
      root.id = 'changed-root'
      document.body.append(root)
      assert.equal(locator.selector, '#changed-root')
      assert.deepEqual(commands, [])
    } else throw Error('Unknown mode')
    assert.deepEqual(late, [])
    process.stdout.write(
      JSON.stringify({
        mode,
        actualFactoryAndSnapshotsHeld: true,
        originalGetterReceiverArgsAndErrors: true,
        legacyNoSerializeAndLazyHeld: true,
      }) + '\n'
    )
  } finally {
    Object.defineProperty(api.page, 'elementLocator', descriptor)
    root.remove()
    outside.remove()
  }
}
run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    binding.dispose()
    leave()
    hook.close()
    collection.close()
    dom.window.close()
  })
