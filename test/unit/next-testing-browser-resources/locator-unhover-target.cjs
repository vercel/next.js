'use strict'
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const provider = createRequire(require.resolve('jest-environment-jsdom'))
const { JSDOM } = provider('jsdom')
const mode = process.argv[2]
const dom = new JSDOM(
  '<!DOCTYPE html><body><button data-testid="subject"></button></body>'
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
const late = [],
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
let left = false
const leave = scopes.enterCreatorScope(
  hook.run(() => scopes.captureCreatorScope())
)
const binding = api.initializeBrowserContext(
  (command, origin, source) => {
    commands.push({ command, origin, source })
    return Promise.resolve()
  },
  mode === 'no-callback'
    ? undefined
    : {
        getConsoleTask() {
          return task
        },
      },
  mode === 'legacy' ? undefined : { serializedClickTargets: true }
)
async function run() {
  let lateFailure
  try {
    const subject = api.page.getByTestId('subject'),
      fn = subject.unhover,
      options = { position: { x: 10, y: 20 } },
      descriptor = { selector: 'html > body', locator: "locator('body')" }
    if (mode === 'delegate') {
      const trace = [],
        sentinel = {},
        receiver = {}
      Object.defineProperty(receiver, 'action', {
        get() {
          trace.push('get')
          assert.equal(this, receiver)
          return function () {
            trace.push('call')
            assert.equal(this, receiver)
            assert.equal(arguments.length, 4)
            assert.equal(arguments[0], '__vitest_hover')
            assert.deepEqual(arguments[1], [])
            assert.equal(arguments[2], options)
            assert.deepEqual(arguments[3], descriptor)
            assert.deepEqual(Object.keys(arguments[3]), ['selector', 'locator'])
            return sentinel
          }
        },
      })
      assert.equal(Reflect.apply(fn, receiver, [options]), sentinel)
      assert.deepEqual(trace, ['get', 'call'])
      assert.equal(commands.length, 0)
      for (const receiver of [undefined, null, {}])
        assert.throws(() => Reflect.apply(fn, receiver, [options]), TypeError)
    } else if (mode === 'source-error') {
      const marker = {},
        receiver = Object.create(Object.getPrototypeOf(subject))
      let reads = 0
      Object.defineProperty(receiver, '_errorSource', {
        get() {
          reads++
          throw marker
        },
      })
      assert.throws(
        () => Reflect.apply(fn, receiver, [options]),
        (error) => error === marker
      )
      assert.equal(reads, 1)
      assert.equal(commands.length, 0)
    } else if (mode === 'legacy') {
      const marker = {}
      Object.defineProperty(subject, 'serialize', {
        get() {
          throw marker
        },
      })
      await subject.unhover(options)
      assert.equal(commands.length, 1)
      assert.equal(commands[0].command.method, 'unhover')
      assert.equal(typeof commands[0].command.element, 'string')
      assert.equal(commands[0].command.locator, undefined)
      Object.defineProperty(subject, 'query', {
        get() {
          throw marker
        },
      })
      await assert.rejects(subject.unhover(), (error) => error === marker)
    } else {
      let receiver =
        mode === 'prototype' || mode === 'source'
          ? Object.create(Object.getPrototypeOf(subject))
          : mode === 'borrowed'
            ? { action: subject.action }
            : subject
      for (const key of ['query', 'serialize'])
        Object.defineProperty(subject, key, {
          get() {
            throw new Error('unused ' + key)
          },
        })
      const marker = new Error('actual receiver source')
      let reads = 0
      if (mode === 'source')
        Object.defineProperty(receiver, '_errorSource', {
          get() {
            reads++
            return marker
          },
        })
      const action = Reflect.apply(fn, receiver, [options])
      const eager = mode === 'source' || mode === 'no-callback'
      assert.equal(commands.length, eager ? 1 : 0)
      options.position.x = 30
      if (mode === 'late') {
        leave()
        left = true
        hook.close()
        await assert.rejects(action, (error) => {
          lateFailure = error
          return /closed|scope|outside|active/i.test(error.message)
        })
        assert.equal(commands.length, 0)
      } else {
        assert.equal(await action, undefined)
        assert.equal(commands.length, 1)
        assert.deepEqual(commands[0].command, {
          method: 'hover',
          locator: descriptor,
          args: [options],
        })
        assert.equal(commands[0].command.args[0], options)
        assert.equal(commands[0].command.args[0].position.x, 30)
        if (mode === 'source') {
          assert.equal(reads, 1)
          assert.equal(commands[0].source, marker)
        }
      }
    }
    for (const finish of task.onFinished) finish()
    assert.deepEqual(late, mode === 'late' ? [lateFailure] : [])
    console.log(
      JSON.stringify({
        mode,
        actualBodyTarget: true,
        receiverAndDelegatePreserved: true,
        legacyUnchanged: true,
        actualLifetimePreserved: true,
      })
    )
  } finally {
    binding.dispose()
    if (!left) leave()
    hook.close()
    collection.close()
    dom.window.close()
  }
}
run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
