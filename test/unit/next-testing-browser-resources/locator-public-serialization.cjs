'use strict'
const assert = require('node:assert/strict')

const { createDOMFixture, locatorGlobals } = require('./dom-fixture.cjs')
const { dom } = createDOMFixture({
  html: '<!DOCTYPE html><body></body>',
  globals: locatorGlobals,
  load: require,
})
const {
  page,
} = require('next/dist/experimental/testing/client/browser-context')
const NativeJSON = JSON
const nativeStringify = JSON.stringify
const descriptor = Object.getOwnPropertyDescriptor(NativeJSON, 'stringify')
const mode = process.argv[2]
const selector = 'internal:testid=[data-testid="target-id"s]'
const formatted = "getByTestId('target-id')"
try {
  if (mode === 'descriptors-values') {
    const locator = page.getByTestId('target-id')
    assert.equal(
      Object.prototype.hasOwnProperty.call(locator, '_pwLocator'),
      false
    )
    assert.equal(
      Object.prototype.hasOwnProperty.call(locator, '_pwSelector'),
      false
    )
    for (const key of ['toString', 'asLocator', 'serialize', 'toJSON']) {
      const value = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(locator),
        key
      )
      assert.equal(Object.prototype.hasOwnProperty.call(locator, key), false)
      assert.equal(value.enumerable, false)
      assert.equal(value.configurable, true)
      assert.equal(value.writable, true)
      assert.equal(value.value.name, key)
      assert.equal(value.value.length, 0)
    }
    assert.equal(String(locator), selector)
    assert.equal(locator.asLocator(), formatted)
    assert.equal(
      Object.prototype.hasOwnProperty.call(locator, '_pwLocator'),
      true
    )
    const first = locator.serialize('ignored')
    const second = locator.serialize()
    const json = locator.toJSON('authored-key')
    assert.deepEqual(first, {
      selector,
      locator: formatted,
      _pwSelector: undefined,
    })
    assert.deepEqual(second, first)
    assert.deepEqual(json, first)
    assert.notEqual(first, second)
    assert.notEqual(second, json)
    assert.equal(Object.getPrototypeOf(first), Object.prototype)
    assert.deepEqual(Object.keys(first), ['selector', 'locator', '_pwSelector'])
    for (const value of Object.values(
      Object.getOwnPropertyDescriptors(first)
    )) {
      assert.equal(value.enumerable, true)
      assert.equal(value.configurable, true)
      assert.equal(value.writable, true)
    }
    assert.equal(
      JSON.stringify(locator),
      nativeStringify({ selector, locator: formatted })
    )
  } else if (mode === 'cache-fields') {
    const locator = page.getByTestId('unused')
    const trace = []
    let value = 'internal:testid=[data-testid="first"s]',
      cache
    const receiver = {
      get selector() {
        trace.push({ event: 'selector' })
        return value
      },
      get _pwSelector() {
        trace.push({ event: '_pwSelector' })
        return undefined
      },
      get _pwLocator() {
        trace.push({ event: '_pwLocator:get' })
        return cache
      },
      set _pwLocator(next) {
        trace.push({ event: '_pwLocator:set', value: next })
        cache = next
      },
    }
    assert.equal(
      locator.asLocator.call(receiver, 'ignored'),
      "getByTestId('first')"
    )
    value = 'internal:testid=[data-testid="second"s]'
    assert.equal(locator.asLocator.call(receiver), "getByTestId('first')")
    assert.deepEqual(trace, [
      { event: '_pwLocator:get' },
      { event: '_pwSelector' },
      { event: 'selector' },
      { event: '_pwLocator:set', value: "getByTestId('first')" },
      { event: '_pwLocator:get' },
    ])
  } else if (mode === 'delegation') {
    const locator = page.getByTestId('unused')
    const value = { opaque: true },
      calls = []
    const receiver = {
      serialize(...args) {
        calls.push({
          originalReceiver: this === receiver,
          argsLength: args.length,
        })
        return value
      },
    }
    assert.equal(locator.toJSON.call(receiver, 'authored-key', value), value)
    const stringReceiver = {
      get selector() {
        calls.push({
          event: 'selector',
          originalReceiver: this === stringReceiver,
        })
        return value
      },
    }
    assert.equal(locator.toString.call(stringReceiver), value)
    assert.deepEqual(calls, [
      { originalReceiver: true, argsLength: 0 },
      { event: 'selector', originalReceiver: true },
    ])
  } else if (mode === 'formatter-effects') {
    const marker = new Error('actual metadata getter error')
    for (const variant of ['getter', 'throw-error', 'throw-undefined']) {
      const locator = page.getByTestId('target-id')
      let reads = 0,
        calls = 0
      Object.defineProperty(NativeJSON, 'stringify', {
        configurable: true,
        get() {
          reads++
          assert.equal(this, NativeJSON)
          return function (value, ...rest) {
            calls++
            assert.equal(this, NativeJSON)
            assert.equal(value, 'target-id')
            assert.equal(rest.length, 0)
            if (variant === 'throw-error') throw marker
            if (variant === 'throw-undefined') throw undefined
            return Reflect.apply(nativeStringify, this, [value])
          }
        },
      })
      const expected = variant === 'getter' ? formatted : selector
      assert.equal(locator.asLocator(), expected)
      assert.equal(locator.asLocator(), expected)
      assert.equal(reads, 1)
      assert.equal(calls, 1)
      Object.defineProperty(NativeJSON, 'stringify', descriptor)
    }
  } else throw Error('Unknown mode')
} finally {
  Object.defineProperty(NativeJSON, 'stringify', descriptor)
  dom.window.close()
}
process.stdout.write(
  nativeStringify({
    mode,
    actualSelectorAndFormatterOnly: true,
    originalReceiverGettersAndArguments: true,
    freshRuntimeObjectsAndCache: true,
  }) + '\n'
)
