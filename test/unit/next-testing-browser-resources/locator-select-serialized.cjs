'use strict'
const assert = require('node:assert/strict')

const { createDOMFixture, locatorGlobals } = require('./dom-fixture.cjs')
const { dom } = createDOMFixture({
  html: '<!DOCTYPE html><body><select data-testid="target" multiple><option value="a">A</option><option value="b">B</option></select></body>',
  globals: locatorGlobals,
  load: require,
})
const scopes = require('next/dist/experimental/testing/client/async-context')
const api = require('next/dist/experimental/testing/client/browser-context')
const mode = process.argv[2],
  late = [],
  commands = [],
  trace = [],
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
const legacy = mode === 'legacy'
const binding = api.initializeBrowserContext(
  (value) => {
    commands.push(value)
    return Promise.resolve()
  },
  {
    getConsoleTask() {
      trace.push('task')
      return task
    },
  },
  legacy ? undefined : { serializedClickTargets: true }
)
const target = api.page.getByTestId('target'),
  descriptor = { selector: '#replacement', locator: "locator('#replacement')" },
  optionDescriptor = { selector: '#option-a', locator: "locator('#option-a')" },
  marker = new Error('actual original select producer error')
Object.defineProperty(target, 'serialize', {
  configurable: true,
  get() {
    trace.push('target:get')
    if (mode === 'target-error') throw marker
    return function () {
      assert.equal(this, target)
      assert.equal(arguments.length, 0)
      trace.push('target:call')
      return descriptor
    }
  },
})
async function run() {
  try {
    let values
    if (mode === 'array' || mode === 'map-error') {
      values = ['a']
      const original = Array.prototype.map
      Object.defineProperty(values, 'map', {
        get() {
          trace.push('map:get')
          return function () {
            assert.equal(this, values)
            assert.equal(arguments.length, 1)
            trace.push('map:call')
            if (mode === 'map-error') throw marker
            return Reflect.apply(original, this, arguments)
          }
        },
      })
    } else if (
      mode === 'locator' ||
      mode === 'option-error' ||
      mode === 'target-error'
    ) {
      values = Object.create({ [Symbol.for('$$vitest:locator')]: false })
      Object.defineProperty(values, 'serialize', {
        get() {
          trace.push('option:get')
          if (mode === 'option-error') throw marker
          return function () {
            assert.equal(this, values)
            assert.equal(arguments.length, 0)
            trace.push('option:call')
            return optionDescriptor
          }
        },
      })
    } else if (mode === 'dom' || mode === 'legacy')
      values = document.querySelectorAll('option')[1]
    else if (mode === 'invalid') values = {}
    else throw new Error('Unknown select producer mode')
    if (['map-error', 'option-error', 'target-error'].includes(mode)) {
      assert.throws(
        () => target.selectOptions(values),
        (error) => error === marker
      )
      assert.deepEqual(commands, [])
      assert.equal(task.onFinished.length, 0)
      assert(!trace.includes('task'))
      if (mode === 'target-error')
        assert.deepEqual(trace, ['option:get', 'option:call', 'target:get'])
    } else if (mode === 'invalid') {
      assert.throws(
        () => target.selectOptions(values),
        /Expected DOM element to be an instance of Element, received object/
      )
      assert.deepEqual(trace, [])
      assert.deepEqual(commands, [])
      assert.equal(task.onFinished.length, 0)
    } else {
      const action = target.selectOptions(values, { timeout: 100 })
      assert.deepEqual(commands, [])
      if (mode === 'array') {
        assert.deepEqual(trace.slice(0, 4), [
          'map:get',
          'map:call',
          'target:get',
          'target:call',
        ])
        values[0] = 'b'
      }
      if (mode === 'locator') {
        assert.deepEqual(trace.slice(0, 4), [
          'option:get',
          'option:call',
          'target:get',
          'target:call',
        ])
        optionDescriptor.selector = '#mutated-option'
      }
      if (legacy) assert(!trace.includes('target:get'))
      await action
      assert.equal(commands.length, 1)
      const command = commands[0]
      assert.equal(command.method, 'selectOptions')
      assert.deepEqual(command.args[1], { timeout: 100 })
      if (legacy) {
        assert.equal('locator' in command, false)
        assert.match(command.element, /^next-test-element-[0-9]+$/)
        assert.match(command.args[0][0].element, /^next-test-element-[0-9]+$/)
      } else {
        assert.equal(command.locator, descriptor)
        assert.equal('element' in command, false)
        if (mode === 'array') assert.deepEqual(command.args[0], ['a'])
        if (mode === 'locator') {
          assert.equal(command.args[0][0].element, optionDescriptor)
          assert.equal(command.args[0][0].element.selector, '#mutated-option')
        }
        if (mode === 'dom') {
          assert.equal(
            command.args[0][0].element.selector,
            'html > body > select > option:nth-child(2)'
          )
          assert.equal(typeof command.args[0][0].element.locator, 'string')
          assert.equal(
            document
              .querySelectorAll('option')[1]
              .hasAttribute('data-next-test-element'),
            false
          )
        }
      }
      for (const finish of task.onFinished) finish()
    }
    assert.deepEqual(late, [])
    process.stdout.write(
      JSON.stringify({
        mode,
        trace,
        commandCount: commands.length,
        legacyPreserved: legacy,
        originalLifetime: true,
      }) + '\n'
    )
  } finally {
    binding.dispose()
    leave()
    hook.close()
    collection.close()
    dom.window.close()
  }
}
run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
