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
    const {
      runSerializedLocatorProducer,
    } = require('./locator-target-fixture.cjs')
    await runSerializedLocatorProducer({
      mode,
      method: 'click',
      descriptor,
      html: '<!DOCTYPE html><body><button data-testid="present"></button></body>',
    })
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
