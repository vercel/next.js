const assert = require('node:assert/strict')
const { runPrivate } = require('./chai-callable.cjs')

runPrivate('name', (family) => ({
  capture: family.startsWith('proxify')
    ? '{ base: () => base, alias: () => alias, accessorReads: () => reads }'
    : '{ names, accessor: () => accessor, getter: () => getter, setter: () => setter, inputReads: () => inputNameReads, accessorReads: () => reads }',
  async verify(captured, dispose) {
    const before = family.startsWith('proxify') ? undefined : captured.names()
    await dispose()
    if (family.startsWith('proxify')) {
      for (const callable of [captured.base(), captured.alias()]) {
        assert.equal(callable.name, '')
        assert.equal(Object.hasOwn(callable, 'name'), false)
      }
    } else {
      assert.deepEqual(captured.names(), before)
      const descriptor = Object.getOwnPropertyDescriptor(
        captured.accessor(),
        'name'
      )
      assert.equal(descriptor.get, captured.getter())
      assert.equal(descriptor.set, captured.setter())
      assert.equal(captured.inputReads(), 0)
    }
    assert.equal(captured.accessorReads(), 2)
  },
  facts: {
    actualNameReadsAfterDispose: true,
  },
})).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
