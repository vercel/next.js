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
  utils,
} = require('next/dist/experimental/testing/client/browser-context')
const mode = process.argv[2]
const key = Symbol.for('$$vitest:locator')
const expected = {
  enumerable: false,
  writable: false,
  configurable: false,
  value: key,
}
function check(value) {
  assert.deepEqual(Object.getOwnPropertyDescriptor(value, key), expected)
  assert.equal(Object.prototype.hasOwnProperty.call(value, key), true)
  assert.equal(
    Object.getOwnPropertySymbols(value).filter((symbol) => symbol === key)
      .length,
    1
  )
  assert.equal(JSON.stringify(value).includes('$$vitest:locator'), false)
}
try {
  if (mode === 'descriptor') {
    const first = page.getByTestId('one'),
      second = page.getByRole('button')
    check(first)
    check(second)
    check(first.getByText('child'))
    assert.notEqual(first, second)
    assert.equal(first[key], second[key])
  } else if (mode === 'immutable') {
    const locator = page.getByTestId('one')
    check(locator)
    assert.equal(Reflect.set(locator, key, 'different'), false)
    assert.equal(Reflect.deleteProperty(locator, key), false)
    assert.throws(
      () => Object.defineProperty(locator, key, { value: 'different' }),
      TypeError
    )
    assert.throws(() => {
      locator[key] = 'different'
    }, TypeError)
    check(locator)
  } else if (mode === 'utilities') {
    const root = document.createElement('section')
    root.innerHTML = '<button data-testid="child">Child</button>'
    document.body.append(root)
    const selectors = utils.getElementLocatorSelectors(root)
    for (const [name, args] of [
      ['getByTestId', ['child']],
      ['getByRole', ['button']],
      ['getByText', ['Child']],
    ]) {
      const locator = selectors[name](...args)
      check(locator)
      assert.equal(typeof locator.serialize().selector, 'string')
    }
    root.remove()
  } else if (mode === 'definition-call') {
    const original = Object.defineProperty,
      calls = []
    let actual
    Object.defineProperty = function (target, property, descriptor) {
      if (property === key)
        calls.push({
          target,
          receiver: this,
          keys: Object.keys(descriptor),
          descriptor,
        })
      return Reflect.apply(original, this, arguments)
    }
    try {
      actual = page.getByTestId('one')
    } finally {
      Object.defineProperty = original
    }
    assert.equal(calls.length, 1)
    assert.equal(calls[0].target, actual)
    assert.equal(calls[0].receiver, Object)
    assert.deepEqual(calls[0].keys, [
      'enumerable',
      'writable',
      'configurable',
      'value',
    ])
    assert.deepEqual(calls[0].descriptor, expected)
    check(actual)
  } else throw Error('Unknown mode')
  process.stdout.write(
    JSON.stringify({
      mode,
      ownSameSymbolBrand: true,
      immutableNonenumerable: true,
      ordinaryConstructorCall: true,
      serializedFacadeUnchanged: true,
    }) + '\n'
  )
} finally {
  dom.window.close()
}
