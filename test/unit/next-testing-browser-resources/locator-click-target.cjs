'use strict'
const assert = require('node:assert/strict')
const {
  resolveClientCommandTarget,
  getClientCommandLocator,
} = require('next/dist/experimental/testing/client/command-target')
const mode = process.argv[2]
const descriptor = {
  selector: 'internal:testid=[data-testid="replacement"s]',
  locator: "getByTestId('replacement')",
  _pwSelector: undefined,
}
const legacy = { method: 'click', element: 'next-test-element-0', args: [] }
async function run() {
  if (mode === 'legacy') {
    for (const method of [
      'click',
      'dblClick',
      'tripleClick',
      'hover',
      'unhover',
      'fill',
      'clear',
      'selectOptions',
      'upload',
      'keyboard',
      'keyboardCleanup',
      'type',
      'wheel',
      'tab',
      'dragAndDrop',
      'future',
    ])
      assert.deepEqual(resolveClientCommandTarget({ ...legacy, method }), {
        kind: 'element',
        id: legacy.element,
        deferred: false,
      })
    for (const method of [
      'click',
      'fill',
      'clear',
      'dblClick',
      'tripleClick',
      'hover',
      'unhover',
      'selectOptions',
    ])
      assert.deepEqual(
        resolveClientCommandTarget({
          ...legacy,
          element: 'next-test-locator-1',
          method,
        }),
        { kind: 'element', id: 'next-test-locator-1', deferred: true }
      )
    assert.deepEqual(
      resolveClientCommandTarget(
        Object.assign(Object.create({ element: legacy.element }), {
          method: 'click',
          args: [],
        })
      ),
      { kind: 'element', id: legacy.element, deferred: false }
    )
  } else if (mode === 'serialized') {
    const command = { method: 'click', locator: descriptor, args: [] }
    assert.deepEqual(resolveClientCommandTarget(command), {
      kind: 'locator',
      selector: descriptor.selector,
      description: descriptor.locator,
    })
    assert.equal(command.locator, descriptor)
    assert.equal(
      Object.prototype.hasOwnProperty.call(descriptor, '_pwSelector'),
      true
    )
    const wire = JSON.parse(JSON.stringify(command))
    assert.deepEqual(wire, {
      method: 'click',
      locator: { selector: descriptor.selector, locator: descriptor.locator },
      args: [],
    })
    assert.equal(
      Object.prototype.hasOwnProperty.call(wire.locator, '_pwSelector'),
      false
    )
  } else if (mode === 'mixed') {
    for (const value of [
      null,
      undefined,
      false,
      [],
      {},
      { ...legacy, locator: descriptor },
      { method: 'click', locator: descriptor, element: undefined, args: [] },
      { method: 'click', locator: descriptor, args: null },
      { method: 'future', locator: descriptor, args: [] },
      { method: 'click', locator: null, args: [] },
      { method: 'click', locator: { selector: 1, locator: 'label' }, args: [] },
      { method: 'click', locator: { selector: 's', locator: null }, args: [] },
      { method: 'keyboard', element: 'next-test-locator-1', args: [] },
    ])
      assert.throws(
        () => resolveClientCommandTarget(value),
        /Invalid Browser Mode element command/
      )
  } else if (mode === 'host-label') {
    const calls = [],
      described = { actual: true }
    let reads = 0,
      locator
    locator = {
      get describe() {
        reads++
        return function (label) {
          calls.push({
            event: 'describe',
            originalReceiver: this === locator,
            label,
          })
          return described
        }
      },
    }
    const frame = {
      locator(selector) {
        calls.push({
          event: 'locator',
          originalReceiver: this === frame,
          selector,
        })
        return locator
      },
    }
    assert.equal(
      getClientCommandLocator(
        frame,
        {
          kind: 'locator',
          selector: descriptor.selector,
          description: descriptor.locator,
        },
        'owned-engine'
      ),
      described
    )
    assert.equal(reads, 2)
    assert.deepEqual(calls, [
      {
        event: 'locator',
        originalReceiver: true,
        selector: descriptor.selector,
      },
      { event: 'describe', originalReceiver: true, label: descriptor.locator },
    ])
    reads = 0
    assert.equal(
      getClientCommandLocator(
        frame,
        { kind: 'element', id: legacy.element, deferred: false },
        'owned-engine'
      ),
      locator
    )
    assert.equal(reads, 0)
    assert.equal(
      calls.at(-1).selector,
      '[data-next-test-element="next-test-element-0"]'
    )
    getClientCommandLocator(
      frame,
      { kind: 'element', id: 'next-test-locator-2', deferred: true },
      'owned-engine'
    )
    assert.equal(calls.at(-1).selector, 'owned-engine=next-test-locator-2')
    const plain = {},
      olderFrame = {
        locator() {
          return plain
        },
      }
    assert.equal(
      getClientCommandLocator(
        olderFrame,
        { kind: 'locator', selector: 's', description: 'label' },
        'owned-engine'
      ),
      plain
    )
  } else if (
    ['producer-alias', 'producer-error', 'producer-legacy'].includes(mode)
  ) {
    const { createRequire } = require('node:module')
    const provider = createRequire(require.resolve('jest-environment-jsdom'))
    const { JSDOM } = require(provider.resolve('jsdom'))
    const dom = new JSDOM(
      '<!DOCTYPE html><body><button data-testid="present"></button></body>'
    )
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
    const late = []
    const collection = scopes.createAsyncScope(
      { kind: 'collection', context: { id: 'file', name: 'file' } },
      (error) => late.push(error)
    )
    const hook = collection.run(() =>
      scopes.createAsyncScope(
        {
          kind: 'hook',
          context: { id: 'hook', suiteId: 'file', name: 'hook' },
        },
        (error) => late.push(error)
      )
    )
    const leave = scopes.enterCreatorScope(
      hook.run(() => scopes.captureCreatorScope())
    )
    const task = { type: 'test', id: 'file/0', onFinished: [] }
    const commands = []
    let taskReads = 0,
      release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const binding = api.initializeBrowserContext(
      (value) => {
        commands.push(value)
        return gate
      },
      {
        getConsoleTask() {
          taskReads++
          return task
        },
      },
      mode === 'producer-legacy' ? undefined : { serializedClickTargets: true }
    )
    try {
      const locator = api.page.getByTestId(
        mode === 'producer-legacy' ? 'present' : 'not-present'
      )
      let reads = 0,
        calls = 0
      const marker = new Error('original serialize getter')
      Object.defineProperty(locator, 'serialize', {
        get() {
          reads++
          assert.equal(this, locator)
          if (mode === 'producer-error' || mode === 'producer-legacy')
            throw marker
          return function (...args) {
            calls++
            assert.equal(this, locator)
            assert.equal(args.length, 0)
            return descriptor
          }
        },
      })
      if (mode === 'producer-error') {
        assert.throws(
          () => locator.click(),
          (error) => error === marker
        )
        assert.equal(reads, 1)
        assert.equal(taskReads, 0)
        assert.equal(commands.length, 0)
        assert.equal(task.onFinished.length, 0)
      } else if (mode === 'producer-legacy') {
        const action = locator.click()
        assert.equal(reads, 0)
        assert.equal(calls, 0)
        assert.equal(commands.length, 0)
        const result = action.then(() => {})
        assert.equal(commands.length, 1)
        assert.equal('locator' in commands[0], false)
        assert.match(commands[0].element, /^next-test-element-[0-9]+$/)
        release()
        await result
        task.onFinished[0]()
      } else {
        const action = locator.click()
        assert.equal(reads, 1)
        assert.equal(calls, 1)
        assert.equal(commands.length, 0)
        assert.equal(task.onFinished.length, 1)
        descriptor.selector = 'internal:testid=[data-testid="mutated"s]'
        const result = action.then(() => {})
        assert.equal(commands.length, 1)
        assert.equal(commands[0].locator, descriptor)
        assert.equal(commands[0].locator.selector, descriptor.selector)
        assert.equal('element' in commands[0], false)
        assert.deepEqual(commands[0].args, [])
        release()
        await result
        task.onFinished[0]()
      }
      assert.deepEqual(late, [])
    } finally {
      release()
      binding.dispose()
      leave()
      hook.close()
      collection.close()
      dom.window.close()
    }
  } else throw Error('Unknown mode')
  process.stdout.write(
    JSON.stringify({
      mode,
      strictTargetForms: true,
      realSelectorAndDescriptionConsumer: true,
      originalDescriptorAndCommandLifetime: true,
    }) + '\n'
  )
}
run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
