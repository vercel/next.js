const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { initializeTestFile } = require(process.argv[2])
const { test } = require(process.argv[3])
const directory = mkdtempSync(join(tmpdir(), 'next-native-body-settlement-'))
const checked = []
const checkpoint = () => new Promise(setImmediate)
function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const options = (extra) => ({
  runId: 'native-body-settlement',
  signal: new AbortController().signal,
  captureCompletedModuleResult: true,
  ...extra,
})
async function withFile(name, load, verify, native = true) {
  const file = initializeTestFile({
    fileId: name,
    filePath: join(directory, `${name}.test.mjs`),
    ...(native
      ? { snapshotBodyFailures: true, onUnhandledRejection() {} }
      : {}),
  })
  try {
    assert.equal(file.getNativeBodySettlement(), undefined)
    await file.collect(load)
    await verify(file)
  } finally {
    await file.dispose()
  }
  checked.push(name)
}
function snapshot(file, pending) {
  const observed = file.getNativeBodySettlement()
  assert.equal(observed.version, 1)
  assert.equal(observed.source, 'node-await-body')
  assert.equal(Object.isFrozen(observed), true)
  assert.equal(Object.isFrozen(observed.invocations), true)
  for (const item of observed.invocations) {
    assert.equal(Object.isFrozen(item), true)
    assert.equal(typeof item.attemptId, 'string')
  }
  assert.equal(
    observed.invocations.filter((item) => !item.settled).length,
    pending
  )
  return observed
}
async function main() {
  for (const native of [false, true]) {
    await withFile(
      `absent-${native ? 'capture-off' : 'producer'}`,
      async () => {
        test('actual body', async () => {
          await Promise.resolve()
        })
      },
      async (file) => {
        await file.run(
          options({ captureCompletedModuleResult: native ? undefined : true })
        )
        assert.equal(file.getNativeBodySettlement(), undefined)
      },
      native
    )
  }
  const traces = []
  for (const capture of [false, true]) {
    const trace = []
    let speciesReads = 0,
      constructorReads = 0
    await withFile(
      `jobs-getters-${capture ? 'on' : 'off'}`,
      async () => {
        test('original await', async () => {
          const descriptor = Object.getOwnPropertyDescriptor(
            Promise,
            Symbol.species
          )
          Object.defineProperty(Promise, Symbol.species, {
            configurable: true,
            get() {
              speciesReads++
              return Promise
            },
          })
          try {
            trace.push('body')
            const work = Promise.resolve().then(() => {
              trace.push('work')
              queueMicrotask(() => trace.push('nested-job'))
            })
            Object.defineProperty(work, 'constructor', {
              configurable: true,
              get() {
                constructorReads++
                return Promise
              },
            })
            queueMicrotask(() => trace.push('sibling-job'))
            await work
            trace.push('body-end')
          } finally {
            Object.defineProperty(Promise, Symbol.species, descriptor)
          }
        })
      },
      async (file) => {
        const result = await file.run(
          options({ captureCompletedModuleResult: capture ? true : undefined })
        )
        assert.equal(result.cases[0].status, 'passed')
        await checkpoint()
        if (capture) assert.equal(snapshot(file, 0).invocations.length, 1)
        else assert.equal(file.getNativeBodySettlement(), undefined)
        traces.push({ trace, speciesReads, constructorReads })
      }
    )
  }
  assert.deepEqual(traces[1], traces[0])
  assert.ok(traces[0].speciesReads > 0)
  assert.ok(traces[0].constructorReads > 0)
  const failure = new Error('original body identity')
  await withFile(
    'body-rejected',
    async () => {
      test('actual rejected body', async () => {
        await Promise.resolve()
        throw failure
      })
    },
    async (file) => {
      const result = await file.run(options())
      assert.equal(result.cases[0].status, 'failed')
      assert.equal(result.cases[0].errors[0].error, failure)
      assert.equal(snapshot(file, 0).invocations.length, 1)
    }
  )
  await withFile(
    'retry-identities',
    async () => {
      let calls = 0
      test('actual retries', { retry: 1 }, async () => {
        await Promise.resolve()
        if (calls++ === 0) throw failure
      })
    },
    async (file) => {
      const result = await file.run(options())
      assert.deepEqual(
        result.cases.map((item) => item.status),
        ['failed', 'passed']
      )
      const observed = snapshot(file, 0)
      assert.equal(observed.invocations.length, 2)
      assert.notEqual(
        observed.invocations[0].attemptId,
        observed.invocations[1].attemptId
      )
    }
  )
  for (const cleanup of [false, true]) {
    const entered = deferred(),
      gate = deferred(),
      finished = deferred()
    const cancel = new AbortController()
    await withFile(
      `cancel-${cleanup ? 'worker-cleanup-settled' : 'still-pending'}`,
      async () => {
        const owned = cleanup
          ? test.extend({
              owner: [
                async ({}, use) => {
                  try {
                    await use(true)
                  } finally {
                    gate.resolve()
                  }
                },
                { scope: 'worker' },
              ],
            })
          : test
        owned('actual pending body', async ({ owner }) => {
          if (cleanup) assert.equal(owner, true)
          entered.resolve()
          try {
            await gate.promise
          } finally {
            finished.resolve()
          }
        })
      },
      async (file) => {
        const running = file.run(options({ userCancelSignal: cancel.signal }))
        void running.catch(() => {})
        try {
          await entered.promise
          assert.equal(snapshot(file, 1).invocations.length, 1)
          cancel.abort(new Error('actual user scheduling cancellation'))
          const result = await running
          // The low-level fulfilled result stays distinct from host cancellation.
          assert.equal(result.interrupted, false)
          assert.equal(file.getCompletedModuleResult().interrupted, false)
          assert.equal(result.cases[0].status, 'skipped')
          assert.equal(file.getOperationSettlement().bounded.pending, 0)
          snapshot(file, 1)
          await file.dispose()
          await checkpoint()
          snapshot(file, cleanup ? 0 : 1)
        } finally {
          gate.resolve()
          await finished.promise
          await checkpoint()
        }
        snapshot(file, 0)
      }
    )
  }
  process.stdout.write(`${JSON.stringify({ checked, traces })}\n`)
}
main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => rmSync(directory, { recursive: true, force: true }))
