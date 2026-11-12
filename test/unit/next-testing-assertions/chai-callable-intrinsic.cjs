const assert = require('node:assert/strict')
const { runPrivate } = require('./chai-callable.cjs')

runPrivate('intrinsic', () => ({
  capture:
    '{ held, retained, intrinsic, getter: () => getter, getterTarget: () => getterTarget, getterReads: () => getterReads, readonly: chai.Assertion.prototype.intrinsicReadonly }',
  async verify(captured, dispose) {
    await dispose()
    assert.equal(captured.intrinsic, Function.prototype.toString)
    assert.equal(captured.getterReads(), 4)
    for (const [label, target] of Object.entries(captured.held)) {
      const method = captured.retained[label]
      assert.equal(method, captured.intrinsic)
      assert.equal(
        Reflect.apply(method, target, []),
        Reflect.apply(captured.intrinsic, target, [])
      )
      for (const receiver of [undefined, null, {}, 73])
        assert.throws(() => Reflect.apply(method, receiver, []), TypeError)
    }
    assert.equal(
      Object.getOwnPropertyDescriptor(captured.getterTarget(), 'toString').get,
      captured.getter()
    )
    assert.equal(
      Object.getOwnPropertyDescriptor(captured.readonly, 'toString').value,
      captured.intrinsic
    )
    assert.equal(captured.getterReads(), 4)
  },
  facts: {
    retainedIntrinsicAfterDispose: true,
    exactNativeReceiverErrorsAfterDispose: true,
    noAdditionalGetterReads: true,
  },
})).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
