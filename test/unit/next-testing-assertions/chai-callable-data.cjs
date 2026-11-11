const assert = require('node:assert/strict')
const { runPrivate } = require('./chai-callable.cjs')

runPrivate('data', () => ({
  capture:
    '{ host: () => host, payload, marker, callerError, foreign, retained, aliasRetained, directAlias: () => directAlias, originalInput: () => originalInput, neverGetter, neverReads: () => neverReads, payloadReads: () => payloadReads }',
  async verify(captured, dispose) {
    const before = Object.getOwnPropertyDescriptors(captured.host())
    await dispose()
    const after = Object.getOwnPropertyDescriptors(captured.host())
    assert.deepEqual(Reflect.ownKeys(after), Reflect.ownKeys(before))
    for (const key of Reflect.ownKeys(before))
      for (const part of Reflect.ownKeys(before[key]))
        assert.equal(after[key][part], before[key][part])
    assert.equal(after.neverField.get, captured.neverGetter)
    assert.equal(Object.keys(captured.retained).length, 4)
    for (const fn of Object.values(captured.retained)) {
      assert.equal(fn, captured.payload)
      assert.equal(
        Reflect.apply(fn, captured.foreign, ['after-dispose']),
        captured.marker
      )
      assert.throws(
        () => Reflect.apply(fn, undefined, ['throw']),
        (error) => error === captured.callerError
      )
    }
    const outcome = (fn) => {
      try {
        Reflect.apply(fn, captured.originalInput(), ['after-dispose'])
        return { ok: true }
      } catch (error) {
        return { ok: false, name: error.name, message: error.message }
      }
    }
    const direct = outcome(captured.directAlias())
    assert.equal(direct.ok, false)
    assert.equal(Object.keys(captured.aliasRetained).length, 4)
    for (const fn of Object.values(captured.aliasRetained)) {
      assert.equal(fn, captured.directAlias())
      assert.deepEqual(outcome(fn), direct)
    }
    for (const key of [
      'fixedAlias',
      'configurableAlias',
      'writableAlias',
      'mutableAlias',
    ])
      assert.deepEqual(outcome(after[key].value), direct)
    assert.equal(captured.neverReads(), 0)
    assert.equal(captured.payloadReads(), 0)
  },
  facts: {
    retainedCallerFunctionsAfterDispose: true,
    publicAliasOwnershipAfterDispose: true,
    neverCalledMetadataGetters: true,
  },
})).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
