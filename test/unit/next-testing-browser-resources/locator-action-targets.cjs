'use strict'
const assert = require('node:assert/strict')
const {
  assertLocatorTargetWire,
  runSerializedLocatorProducer,
} = require('./locator-target-fixture.cjs')
const [mode, method] = process.argv.slice(2)
assert(['dblClick', 'tripleClick', 'hover', 'clear'].includes(method))
const descriptor = {
  selector: 'internal:testid=[data-testid="replacement"s]',
  locator: "getByTestId('replacement')",
}
async function run() {
  if (mode === 'wire') {
    assertLocatorTargetWire(method, descriptor, ['future', 'unhover'])
  } else {
    await runSerializedLocatorProducer({
      mode,
      method,
      descriptor,
      html: '<!DOCTYPE html><body><button data-testid="present"></button></body>',
    })
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
