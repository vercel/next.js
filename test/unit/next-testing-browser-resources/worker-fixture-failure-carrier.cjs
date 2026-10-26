const assert = require('node:assert/strict')
const {
  initializeTestFile,
  getAssertionRuntime,
} = require('next/dist/experimental/testing/runner')
const mode = process.argv[2]
assert(
  [
    'normal',
    'worker',
    'before',
    'mixed-same',
    'assertion',
    'worker-assertion-same',
  ].includes(mode)
)
async function main() {
  const shared = new Error('actual disposal failure')
  const file = initializeTestFile({
    fileId: 'worker-carrier-' + mode,
    filePath: '/worker-carrier.test.mjs',
    resourceLifetime: 'file',
    updateSnapshots: true,
  })
  let release, entered, runtime, descriptor
  const started = new Promise((resolve) => {
    entered = resolve
  })
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const workerFails = [
    'worker',
    'mixed-same',
    'worker-assertion-same',
  ].includes(mode)
  try {
    await file.collect(() => {
      runtime = getAssertionRuntime()
      const test = file.api.test.extend({
        resource: [
          async ({}, use) => {
            await use(1)
            entered()
            await gate
            if (workerFails) throw shared
          },
          { scope: 'worker' },
        ],
      })
      test('actual body', ({ resource }) => assert.equal(resource, 1))
    })
    const result = await file.run({
      signal: new AbortController().signal,
      testTimeout: 1000,
      hookTimeout: 1000,
    })
    assert.deepEqual(
      result.cases.map((test) => test.status),
      ['passed']
    )
    assert.equal(file.takeOwnedWorkerDisposalFailure(shared), undefined)
    if (mode === 'assertion' || mode === 'worker-assertion-same') {
      descriptor = Object.getOwnPropertyDescriptor(runtime, 'finishFile')
      Object.defineProperty(runtime, 'finishFile', {
        ...descriptor,
        value: async function (...args) {
          await Reflect.apply(descriptor.value, this, args)
          throw shared
        },
      })
    }
    const disposing = file.dispose({
      beforeOwnedWorkerDispose: () => {
        if (mode === 'before' || mode === 'mixed-same') throw shared
      },
    })
    const outcome = disposing.then(
      (value) => ({ value }),
      (error) => ({ error })
    )
    await started
    assert.equal(file.takeOwnedWorkerDisposalFailure(shared), undefined)
    release()
    const settled = await outcome
    if (mode === 'mixed-same' || mode === 'worker-assertion-same') {
      assert(settled.error instanceof AggregateError)
      assert.deepEqual(settled.error.errors, [shared, shared])
      assert.equal(file.takeOwnedWorkerDisposalFailure(shared), undefined)
      assert.equal(
        file.takeOwnedWorkerDisposalFailure(settled.error),
        undefined
      )
    } else if (mode === 'worker') {
      assert.equal(settled.error, shared)
      assert.equal(
        file.takeOwnedWorkerDisposalFailure(new Error('foreign')),
        undefined
      )
      const occurrence = file.takeOwnedWorkerDisposalFailure(shared)
      assert.equal(occurrence.error, shared)
      assert.equal(Object.isFrozen(occurrence), true)
      assert.equal(file.takeOwnedWorkerDisposalFailure(shared), undefined)
    } else {
      assert.equal(settled.error, mode === 'normal' ? undefined : shared)
      assert.equal(file.takeOwnedWorkerDisposalFailure(shared), undefined)
    }
    if (mode !== 'normal') assert.throws(() => file.takeSnapshotUpdates())
    process.stdout.write(
      JSON.stringify({
        mode,
        actualWorkerDisposalJoined: true,
        oneConsumption: true,
        mixedSameIdentityNotClassified: true,
      }) + '\n'
    )
  } finally {
    release()
    if (descriptor) Object.defineProperty(runtime, 'finishFile', descriptor)
    await file.dispose().catch(() => {})
  }
}
main().catch((error) => {
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
