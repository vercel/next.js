const assert = require('node:assert/strict')
const path = require('node:path')

async function main() {
  const mode = process.argv[3]
  const {
    registerVitestAssertionTaskRuntime: register,
    getVitestAssertionTaskRuntime: runtime,
    recordAsyncExpect,
  } = require(
    path.join(
      process.argv[2],
      'packages/next/dist/compiled/next-test-primitives',
      mode === 'browser' ? 'browser/index.js' : 'index.js'
    )
  )
  const carrier = () => ({
    type: 'test',
    fullTestName: 'controlled actual owner',
    promises: [],
    onFinished: [],
    result: { state: 'run', errors: [] },
  })
  for (const outcome of ['fulfilled', 'rejected', 'soft']) {
    const actual = { type: 'test' }
    const previous = carrier()
    const next = carrier()
    let resolve
    let reject
    const operation = new Promise((yes, no) => {
      resolve = yes
      reject = no
    })
    const reason = new Error('controlled original attempt rejection')
    register(actual, previous)
    const pending = recordAsyncExpect(
      actual,
      operation,
      'expect(actual).controlled()',
      new Error('controlled assertion origin'),
      outcome === 'soft'
    )
    assert.equal(previous.promises.length, 1)
    assert.equal(previous.onFinished.length, 1)
    register(actual, next)
    assert.equal(runtime(actual), next)
    // Arm the observer before the original operation settles. The primitive's
    // callbacks must retain the carrier captured before the actual Test rebind.
    const observed = Promise.resolve(pending)
    const checked =
      outcome === 'rejected'
        ? assert.rejects(observed, (error) => error === reason)
        : observed
    if (outcome === 'fulfilled') resolve(17)
    else reject(reason)
    const value = await checked
    if (outcome === 'fulfilled') assert.equal(value, 17)
    assert.equal(previous.promises.length, 0)
    assert.equal(next.promises.length, 0)
    assert.equal(next.onFinished.length, 0)
    assert.equal(next.result.state, 'run')
    assert.deepEqual(next.result.errors, [])
    previous.onFinished[0]()
    if (outcome === 'soft') {
      assert.equal(previous.result.state, 'fail')
      assert.equal(previous.result.errors.length, 1)
      assert.equal(previous.result.errors[0].message, reason.message)
    } else {
      assert.equal(previous.result.state, 'run')
      assert.deepEqual(previous.result.errors, [])
    }
  }
  const manual = carrier()
  assert.equal(runtime(manual), manual)
  assert.equal(
    await recordAsyncExpect(
      manual,
      Promise.resolve(19),
      'expect(actual).manual()',
      new Error('manual assertion origin')
    ),
    19
  )
  assert.equal(manual.promises.length, 0)
  manual.onFinished[0]()
  let reads = 0
  const untouched = new Proxy(
    {},
    {
      get() {
        reads++
        return undefined
      },
    }
  )
  assert.equal(runtime(untouched), untouched)
  assert.equal(runtime(undefined), undefined)
  assert.equal(reads, 0)
  process.stdout.write(
    JSON.stringify({
      mode,
      capturedOutcomes: 3,
      manualUnchanged: true,
      lookupReads: reads,
    }) + '\n'
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
