const assert = require('node:assert/strict')
const dynamic = require('next/dist/experimental/testing/mocking/dynamic')
const cache = require('next/dist/experimental/testing/mocking/module-cache')
const mode = process.argv[2]
const pending = []
const late = []
const retired = []
const nativeDefault = { value: 30 }
const fn = function fn(value) {
  return [this.value, value]
}
nativeDefault.fn = fn
const nativeNamespace = Object.assign(Object.create(null), {
  default: nativeDefault,
  value: 30,
  fn,
})
let evaluations = 0
let runtimeFactories = 0
let release
let reject
const gate = new Promise((yes, no) => {
  release = yes
  reject = no
})
const cause = new Error('actual original failed')
const retireCause = new Error('retire failed')
const prototype = {
  i(id) {
    let record = this.c.get(id)
    if (!record) {
      const factory = this.M.get(id)
      assert.equal(typeof factory, 'function')
      record = { id, exports: undefined }
      this.c.set(id, record)
      record.exports = factory(record)
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
const originalLoader = prototype.A
const entry = { id: 1, exports: {} }
const context = Object.assign(Object.create(prototype), {
  m: entry,
  c: new Map([[1, entry]]),
  M: new Map([
    [1, () => entry.exports],
    [
      2,
      () => {
        evaluations++
        return ['pending', 'rejection', 'dispose-pending'].includes(mode)
          ? gate
          : new Proxy(nativeNamespace, {})
      },
    ],
    [3, () => ({ value: 5 })],
  ]),
})
const target = {
  id: 2,
  requests: ['package'],
  nativeOriginal: 'commonjs',
  nativeOriginalInitial: true,
}
const tags = {
  'invalid-false': false,
  'invalid-null': null,
  'invalid-string': 'true',
  'invalid-number': 1,
  'invalid-object': {},
  'invalid-array': [],
}
if (Object.hasOwn(tags, mode)) target.nativeOriginalInitial = tags[mode]
if (mode === 'invalid-esm') target.nativeOriginal = 'esm'
if (mode === 'invalid-untyped') delete target.nativeOriginal
if (mode === 'absent') delete target.nativeOriginalInitial
if (mode === 'foreign-alias') target.aliases = [99]
if (mode === 'mixed-static') target.staticMock = { initial: 3, provider: 2 }
if (mode === 'old-equal-static') target.staticMock = { initial: 2, provider: 2 }
if (mode === 'owner-overlap') target.id = 1
const manifest = { version: 1, owners: [1], targets: [target] }
const encoded = JSON.stringify(manifest)
const cacheManifest =
  mode === 'protected-provider'
    ? { version: 1, resettable: [3], protected: [1, 2] }
    : {
        version: 1,
        resettable: [2],
        protected: [1],
        ...(['mixed-static', 'old-equal-static'].includes(mode)
          ? { protected: [1, 3], staticMocks: [{ initial: 3, provider: 2 }] }
          : {}),
      }
const cacheOwner = cache.initializeModuleCache(
  context,
  cacheManifest,
  (records) => {
    retired.push(records)
    if (mode === 'retire-failure') throw retireCause
  }
)
if (mode === 'closed-cache') cacheOwner.dispose()
let binding
function install() {
  return dynamic.initializeDynamicModuleMocking(context, manifest, {
    trackImport(value) {
      pending.push(value)
    },
    onLateFailure(error) {
      late.push(error)
    },
  })
}
async function main() {
  try {
    if (mode.startsWith('invalid-') || mode === 'mixed-static') {
      assert.throws(
        install,
        /Invalid runtime native original initialization identity/
      )
      assert.equal(evaluations, 0)
      assert.equal(context.c.size, 1)
      assert.equal(prototype.A, originalLoader)
    } else if (mode === 'old-equal-static') {
      assert.throws(install, /Invalid runtime static mock pair identity/)
      assert.equal(evaluations, 0)
    } else if (
      ['protected-provider', 'closed-cache', 'foreign-alias'].includes(mode)
    ) {
      assert.throws(install, /not owned by this module cache/)
      assert.equal(evaluations, 0)
    } else if (mode === 'owner-overlap') {
      assert.throws(install, /Invalid runtime mock target identity/)
      assert.equal(evaluations, 0)
    } else {
      binding = install()
      assert.equal(evaluations, 0)
      assert.equal(context.c.size, 1)
      if (mode === 'lazy') {
        assert.equal(pending.length, 0)
      } else if (mode === 'absent') {
        assert.throws(
          () => dynamic.importNativeActual('package', context),
          /certified static\/runtime pair/
        )
        assert.equal(evaluations, 0)
      } else if (mode.startsWith('foreign-')) {
        let importer
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
          /actual compiler helper owner/
        )
        assert.equal(evaluations, 0)
        assert.equal(pending.length, 0)
      } else if (['pending', 'rejection', 'dispose-pending'].includes(mode)) {
        const first = dynamic.importNativeActual('package', context)
        const seen = first.catch((error) => error)
        const record = context.c.get(2)
        assert.equal(record.exports, gate)
        assert.equal(evaluations, 1)
        if (mode === 'dispose-pending') {
          let cancelled
          assert.throws(
            () => binding.dispose(),
            (error) => {
              cancelled = error
              return /cancelled during file cleanup/.test(error.message)
            }
          )
          assert.equal(await seen, cancelled)
          release(new Proxy(nativeNamespace, {}))
          await gate
          await Promise.allSettled(pending)
          assert.equal(late.length, 1)
          assert.match(
            late[0].message,
            /originating runtime module mock file has been disposed/
          )
          assert.throws(
            () => dynamic.importNativeActual('package', context),
            /active compiler-owned file/
          )
        } else if (mode === 'rejection') {
          reject(cause)
          assert.equal(await seen, cause)
          await assert.rejects(
            dynamic.importNativeActual('package', context),
            (error) => error === cause
          )
          assert.equal(context.c.get(2), record)
          assert.equal(evaluations, 1)
        } else {
          const second = dynamic.importNativeActual('package', context)
          const namespace = new Proxy(nativeNamespace, {})
          release(namespace)
          assert.equal(await first, namespace)
          assert.equal(await second, namespace)
          assert.equal(context.c.get(2), record)
          assert.equal(evaluations, 1)
        }
      } else {
        // The real model loader creates the provider record by invoking its retained factory.
        const initial = prototype.i.call(context, 2)
        const initialRecord = context.c.get(2)
        assert.equal(initialRecord.exports, initial)
        assert.equal(evaluations, 1)
        assert.equal(await context.A(4), initial)
        assert.equal(
          await dynamic.importNativeActual('package', context),
          initial
        )
        assert.throws(
          () => cache.assertNativeModuleOwnership(context, [2], 2),
          /not owned by this module cache/
        )
        if (mode === 'initial') {
          assert.equal(evaluations, 1)
        } else if (mode === 'retire-failure') {
          assert.throws(
            () => cache.resetModules(),
            (error) => error === retireCause
          )
          assert.equal(context.c.get(2), initialRecord)
          assert.equal(
            await dynamic.importNativeActual('package', context),
            initial
          )
          assert.equal(evaluations, 1)
        } else if (mode === 'reset' || mode === 'unregistered-reset') {
          let mocked
          if (mode === 'reset') {
            let actual
            dynamic.doMock('package', async (load) => {
              runtimeFactories++
              actual = await load()
              return { value: 73 }
            })
            mocked = await context.A(4)
            assert.equal(actual, initial)
            assert.equal(mocked.value, 73)
          }
          cache.resetModules()
          assert.equal(context.c.has(2), false)
          assert.equal(context.c.get(1), entry)
          assert.equal(retired[0][0], initialRecord)
          const next = await dynamic.importNativeActual('package', context)
          assert.notEqual(next, initial)
          assert.equal(next.default, initial.default)
          assert.equal(next.fn, initial.fn)
          assert.equal(evaluations, 2)
          if (mode === 'reset') {
            assert.equal(await context.A(4), mocked)
            assert.equal(runtimeFactories, 1)
            dynamic.doUnmock('package')
          }
          assert.equal(await context.A(4), next)
          assert.equal(
            await dynamic.importNativeActual('package', context),
            next
          )
          assert.equal(initialRecord.exports, initial)
        } else throw new Error('Unknown original-initial component mode')
      }
      await Promise.allSettled(pending)
      if (mode !== 'dispose-pending') assert.deepEqual(late, [])
    }
    assert.equal(JSON.stringify(manifest), encoded)
  } finally {
    try {
      binding?.dispose()
    } finally {
      cacheOwner.dispose()
    }
  }
  assert.equal(prototype.A, originalLoader)
  process.stdout.write(
    JSON.stringify({ mode, originalInitialComponent: true }) + '\n'
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
