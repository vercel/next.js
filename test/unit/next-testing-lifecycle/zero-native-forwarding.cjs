const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os')
const runner = require(process.argv[2]),
  { getOriginatingAttempt } = require(process.argv[3])
async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'next-zero-native-')),
    events = []
  const file = runner.initializeTestFile({
    fileId: 'zero-native',
    filePath: path.join(root, 'zero.test.mjs'),
  })
  file.enableBrowserPublicTaskQueues()
  const NativePromise = Promise,
    thenDescriptor = Object.getOwnPropertyDescriptor(
      NativePromise.prototype,
      'then'
    ),
    globalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Promise')
  let ctorCalls = 0,
    thenCalls = 0,
    hookCalls = 0
  function restore() {
    Object.defineProperty(globalThis, 'Promise', globalDescriptor)
    Object.defineProperty(NativePromise.prototype, 'then', thenDescriptor)
  }
  try {
    await file.collect(async () => {
      file.api.beforeEach((context) => {
        if (context.task.name !== 'captured native facilities') return
        hookCalls++
        function AuthoredPromise(executor) {
          ctorCalls++
          return new NativePromise(executor)
        }
        Object.setPrototypeOf(AuthoredPromise, NativePromise)
        AuthoredPromise.prototype = NativePromise.prototype
        for (const name of [
          'resolve',
          'reject',
          'all',
          'allSettled',
          'race',
          'any',
        ])
          Object.defineProperty(AuthoredPromise, name, {
            value: NativePromise[name].bind(NativePromise),
            configurable: true,
          })
        Object.defineProperty(globalThis, 'Promise', {
          ...globalDescriptor,
          value: AuthoredPromise,
        })
        Object.defineProperty(NativePromise.prototype, 'then', {
          ...thenDescriptor,
          value: function (...args) {
            thenCalls++
            return Reflect.apply(thenDescriptor.value, this, args)
          },
        })
      })
      file.api.afterEach(restore)
      file.api.test('captured native facilities', { timeout: 0 }, (context) => {
        const calls = { ctorCalls, thenCalls }
        assert.equal(globalThis.Promise === NativePromise, false)
        assert.equal(
          NativePromise.prototype.then === thenDescriptor.value,
          false
        )
        assert.equal(hookCalls, 1)
        restore()
        assert.deepEqual(calls, { ctorCalls: 0, thenCalls: 0 })
        const origin = getOriginatingAttempt()
        assert.equal(origin.task, context.task)
        events.push('body')
        let reads = 0
        Object.defineProperty(context.task, 'promises', {
          configurable: true,
          get() {
            assert.equal(getOriginatingAttempt(), origin)
            reads++
            events.push('getter-' + reads)
            return []
          },
        })
        context.onTestFinished((payload) => {
          assert.equal(payload, context)
          assert.equal(getOriginatingAttempt(), origin)
          assert.equal(reads, 2)
          events.push('finished')
        }, 0)
      })
    })
    const result = await file.run({
      runId: 'zero-native',
      signal: new AbortController().signal,
    })
    assert.deepEqual(
      result.cases.map((c) => c.status),
      ['passed']
    )
    assert.deepEqual(events, ['body', 'getter-1', 'getter-2', 'finished'])
    assert.equal(file.getNativeBodySettlement(), undefined)
    console.log(
      JSON.stringify({
        events,
        ctorCalls,
        thenCalls,
        hookCalls,
        mutationsInstalled: true,
        sameOrigin: true,
        nativeBodyAbsent: true,
      })
    )
  } finally {
    restore()
    await file.dispose()
    await fs.rm(root, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
