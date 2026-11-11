const assert = require('node:assert/strict')
const dynamic = require('next/dist/experimental/testing/mocking/dynamic')
const cache = require('next/dist/experimental/testing/mocking/module-cache')
const mode = process.argv[2]
const pending = []
const late = []
let evaluations = 0
const prototype = {
  i(id) {
    let record = this.c.get(id)
    if (!record) {
      record = { id, exports: { value: 20, evaluation: ++evaluations } }
      this.c.set(id, record)
    }
    return record.exports
  },
  r() {
    return (load) => Promise.resolve().then(() => load(2))
  },
  A(id) {
    return this.r(id)(this.i.bind(this))
  },
}
const record = { id: 1, exports: {} }
const context = Object.assign(Object.create(prototype), {
  m: record,
  c: new Map([
    [1, record],
    [3, { id: 3, exports: { value: 5 } }],
  ]),
  M: new Map([
    [1, () => {}],
    [2, () => {}],
    [3, () => {}],
  ]),
})
const paired = mode !== 'unpaired'
const cacheOwner = cache.initializeModuleCache(
  context,
  {
    version: 1,
    resettable: [2],
    protected: [1, 3],
    ...(paired ? { staticMocks: [{ initial: 3, provider: 2 }] } : {}),
  },
  () => {}
)
const binding = dynamic.initializeDynamicModuleMocking(
  context,
  {
    version: 1,
    owners: [1],
    targets: [
      {
        id: 2,
        requests: ['package'],
        nativeOriginal: 'commonjs',
        ...(paired ? { staticMock: { initial: 3, provider: 2 } } : {}),
      },
    ],
  },
  {
    trackImport(value) {
      pending.push(value)
    },
    onLateFailure(error) {
      late.push(error)
    },
  }
)
async function main() {
  try {
    if (
      [
        'unpaired',
        'omitted',
        'foreign-id',
        'foreign-prototype',
        'foreign-record',
      ].includes(mode)
    ) {
      let importer = context
      if (mode === 'omitted') importer = undefined
      if (mode === 'foreign-id')
        importer = Object.assign(Object.create(prototype), {
          ...context,
          m: { id: 99 },
        })
      if (mode === 'foreign-prototype') importer = { ...context }
      if (mode === 'foreign-record')
        importer = Object.assign(Object.create(prototype), {
          ...context,
          m: { id: 1, exports: {} },
        })
      assert.throws(
        () => dynamic.importNativeActual('package', importer),
        mode === 'unpaired'
          ? /certified static\/runtime pair/
          : /actual compiler helper owner/
      )
      assert.equal(evaluations, 0)
      assert.equal(pending.length, 0)
    } else {
      const actual = await dynamic.importNativeActual('package', context)
      assert.equal(actual.value, 20)
      assert.equal(await dynamic.importNativeActual('package', context), actual)
      let original
      dynamic.doMock('package', async (load) => {
        original = await load()
        return { value: 73 }
      })
      const mocked = await context.A(4)
      assert.equal(original, actual)
      assert.equal(mocked.value, 73)
      if (mode === 'resets') {
        cache.resetModules()
        const next = await dynamic.importNativeActual('package', context)
        assert.notEqual(next, actual)
        assert.equal(next.evaluation, 2)
        assert.equal(await context.A(4), mocked)
        dynamic.doUnmock('package')
        assert.equal(await context.A(4), next)
      } else if (mode === 'reuses') {
        dynamic.doUnmock('package')
        assert.equal(await context.A(4), actual)
        assert.equal(evaluations, 1)
      } else throw new Error('Unknown native actual control')
      await Promise.all(pending)
    }
    assert.deepEqual(late, [])
  } finally {
    binding.dispose()
    cacheOwner.dispose()
  }
  process.stdout.write(JSON.stringify({ mode, ownedActualCache: true }) + '\n')
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
