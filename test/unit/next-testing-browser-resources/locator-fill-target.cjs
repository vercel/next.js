'use strict'
const assert = require('node:assert/strict')
const {
  resolveClientCommandTarget,
  getClientCommandLocator,
} = require('next/dist/experimental/testing/client/command-target')
const [mode, method] = process.argv.slice(2)
assert.equal(method, 'fill')
const descriptor = {
  selector: 'internal:testid=[data-testid="replacement"s]',
  locator: "getByTestId('replacement')",
}
async function run() {
  if (mode === 'wire') {
    const target = resolveClientCommandTarget({
      method,
      locator: descriptor,
      args: [{ timeout: 1234 }],
    })
    assert.deepEqual(target, {
      kind: 'locator',
      selector: descriptor.selector,
      description: descriptor.locator,
    })
    const calls = [],
      described = { actual: true },
      locator = {
        describe(label) {
          calls.push({ event: 'describe', label, receiver: this === locator })
          return described
        },
      },
      frame = {
        locator(selector) {
          calls.push({ event: 'locator', selector, receiver: this === frame })
          return locator
        },
      }
    assert.equal(
      getClientCommandLocator(frame, target, 'old-engine'),
      described
    )
    assert.deepEqual(calls, [
      { event: 'locator', selector: descriptor.selector, receiver: true },
      { event: 'describe', label: descriptor.locator, receiver: true },
    ])
    for (const value of [
      { method, locator: descriptor, element: 'next-test-element-1', args: [] },
      { method: 'future', locator: descriptor, args: [] },
    ])
      assert.throws(
        () => resolveClientCommandTarget(value),
        /Invalid Browser Mode element command/
      )
  } else {
    assert(
      [
        'producer-alias',
        'producer-options',
        'producer-error',
        'producer-legacy',
      ].includes(mode)
    )

    const { createDOMFixture, locatorGlobals } = require('./dom-fixture.cjs')
    const { dom } = createDOMFixture({
      html: '<!DOCTYPE html><body><input data-testid="present"></body>',
      globals: locatorGlobals,
      load: require,
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
      const options = { timeout: 1234 }
      const invoke = () =>
        mode === 'producer-options'
          ? locator[method]('filled', options)
          : locator[method]('filled')
      if (mode === 'producer-error') {
        assert.throws(
          () => invoke(),
          (error) => error === marker
        )
        assert.equal(reads, 1)
        assert.equal(taskReads, 0)
        assert.equal(commands.length, 0)
        assert.equal(task.onFinished.length, 0)
      } else if (mode === 'producer-legacy') {
        const action = invoke()
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
        const action = invoke()
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
        assert.deepEqual(
          commands[0].args,
          mode === 'producer-options' ? ['filled', options] : ['filled']
        )
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
  }
  process.stdout.write(
    JSON.stringify({
      mode,
      method,
      actualSelectorConsumer: true,
      retainedDescriptorAndOptions: true,
      legacyNoSerialization: true,
    }) + '\n'
  )
}
run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
