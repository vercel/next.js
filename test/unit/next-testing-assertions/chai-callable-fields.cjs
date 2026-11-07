const assert = require('node:assert/strict')
const { runPrivate } = require('./chai-callable.cjs')

runPrivate('fields', () => ({
  capture:
    '{ authored: () => authored, getter: () => getter, setter: () => setter, marker, field, reads: () => reads, writes: () => writes }',
  async verify(captured, dispose) {
    const before = Object.getOwnPropertyDescriptors(captured.authored())
    const enumerable = Object.keys(captured.authored())
    await dispose()
    const after = Object.getOwnPropertyDescriptors(captured.authored())
    assert.deepEqual(Reflect.ownKeys(after), Reflect.ownKeys(before))
    for (const key of Reflect.ownKeys(before))
      for (const part of Reflect.ownKeys(before[key]))
        assert.equal(after[key][part], before[key][part])
    assert.equal(after.authoredReadonly.value, captured.marker)
    assert.equal(after.authoredReadonly.writable, false)
    assert.equal(after.authoredReadonly.configurable, false)
    assert.equal(after.authoredAccessor.get, captured.getter())
    assert.equal(after.authoredAccessor.set, captured.setter())
    assert.equal(after[captured.field].value, 73)
    assert.deepEqual(Object.keys(captured.authored()), enumerable)
    assert.equal(
      Object.getOwnPropertyDescriptor(
        captured.authored(),
        'absentCallableField'
      ),
      undefined
    )
    assert.equal(captured.reads(), 0)
    assert.equal(captured.writes(), 0)
  },
  facts: {
    actualDescriptorIdentityAfterDispose: true,
    noGetterReads: true,
  },
})).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
