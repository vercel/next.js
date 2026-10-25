const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { initializeTestFile } = require(process.argv[2])
const { test, beforeEach, afterAll, aroundEach, aroundAll } = require(
  process.argv[3]
)

const directory = mkdtempSync(join(tmpdir(), 'next-operation-settlement-'))
const checked = []
const options = (extra) => ({
  runId: 'operation-settlement',
  signal: new AbortController().signal,
  captureCompletedModuleResult: true,
  ...extra,
})
const checkpoint = () => new Promise(setImmediate)
function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function withFile(name, load, verify) {
  const file = initializeTestFile({
    fileId: name,
    filePath: join(directory, `${name}.test.mjs`),
  })
  try {
    assert.equal(file.getOperationSettlement(), undefined)
    await file.collect(load)
    await verify(file)
  } catch (error) {
    throw new Error(`Operation observation ${name} failed`, { cause: error })
  } finally {
    await file.dispose()
  }
  checked.push(name)
}
function assertSettled(file) {
  const state = file.getOperationSettlement()
  assert.equal(state.version, 1)
  assert.equal(state.bounded.pending, 0)
  assert.equal(state.around.pending, 0)
  assert.equal(state.pendingHooks, 0)
  assert.equal(Object.isFrozen(state), true)
  assert.equal(Object.isFrozen(state.bounded), true)
  assert.equal(Object.isFrozen(state.around), true)
  return state
}
async function main() {
  await withFile(
    'capture-off',
    async () => test('ordinary', () => {}),
    async (file) => {
      await file.run(options({ captureCompletedModuleResult: undefined }))
      assert.equal(file.getOperationSettlement(), undefined)
      await file.dispose()
      assert.equal(file.getOperationSettlement(), undefined)
    }
  )
  for (const failed of [false, true]) {
    await withFile(
      `settled-${failed ? 'failure' : 'success'}`,
      async () => {
        test('actual body', async () => {
          await Promise.resolve()
          if (failed) throw new Error('actual body failure')
        })
      },
      async (file) => {
        const result = await file.run(options())
        assert.equal(result.cases[0].status, failed ? 'failed' : 'passed')
        const state = assertSettled(file)
        assert.ok(state.bounded.observed > 0)
        await file.dispose()
        assert.deepEqual(file.getOperationSettlement(), state)
      }
    )
  }
  {
    const gate = deferred(),
      finished = deferred()
    await withFile(
      'pending-body',
      async () => {
        test('actual pending body', { timeout: 10 }, async () => {
          try {
            await gate.promise
          } finally {
            finished.resolve()
          }
        })
      },
      async (file) => {
        try {
          const result = await file.run(options())
          assert.equal(result.cases[0].status, 'failed')
          assert.equal(result.interrupted, true)
          assert.equal(file.getOperationSettlement().bounded.pending, 1)
          await file.dispose()
          assert.equal(file.getOperationSettlement().bounded.pending, 1)
        } finally {
          gate.resolve()
          await finished.promise
          await checkpoint()
        }
        assertSettled(file)
      }
    )
  }
  {
    const gate = deferred(),
      finished = deferred()
    await withFile(
      'hook-settled-by-afterAll',
      async () => {
        beforeEach(async () => {
          try {
            await gate.promise
          } finally {
            finished.resolve()
          }
        }, 10)
        test('blocked body', () => {
          throw new Error('must remain blocked')
        })
        afterAll(async () => {
          gate.resolve()
          await finished.promise
        })
      },
      async (file) => {
        try {
          const result = await file.run(options())
          assert.equal(result.cases[0].status, 'failed')
          assertSettled(file)
        } finally {
          gate.resolve()
          await finished.promise
        }
      }
    )
  }
  {
    const entered = deferred(),
      gate = deferred()
    await withFile(
      'actual-pending-hooks',
      async () => {
        beforeEach(async () => {
          entered.resolve()
          await gate.promise
        })
        test('actual body', () => {})
      },
      async (file) => {
        const running = file.run(options({ sequence: { hooks: 'parallel' } }))
        void running.catch(() => {})
        try {
          await entered.promise
          const state = file.getOperationSettlement()
          assert.ok(state.pendingHooks > 0)
          assert.ok(state.bounded.pending > 0)
        } finally {
          gate.resolve()
          await running
        }
        assertSettled(file)
      }
    )
  }
  {
    const gate = deferred(),
      finished = deferred()
    await withFile(
      'worker-disposal-settles-body',
      async () => {
        const owned = test.extend({
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
        owned('actual pending body', { timeout: 10 }, async ({ owner }) => {
          assert.equal(owner, true)
          try {
            await gate.promise
          } finally {
            finished.resolve()
          }
        })
      },
      async (file) => {
        try {
          await file.run(options())
          assert.equal(file.getOperationSettlement().bounded.pending, 1)
          await file.dispose()
          await finished.promise
          await checkpoint()
          assertSettled(file)
        } finally {
          gate.resolve()
          await finished.promise
        }
      }
    )
  }
  for (const phase of ['teardown', 'setup']) {
    const gate = deferred(),
      finished = deferred()
    await withFile(
      `around-${phase}`,
      async () => {
        const register = phase === 'setup' ? aroundAll : aroundEach
        register(async (run) => {
          try {
            if (phase === 'setup') await gate.promise
            await run()
            if (phase === 'teardown') await gate.promise
          } finally {
            finished.resolve()
          }
        }, 10)
        test('actual body', () => {})
      },
      async (file) => {
        try {
          await file.run(options())
          assert.equal(file.getOperationSettlement().around.observed, 1)
          assert.equal(file.getOperationSettlement().around.pending, 1)
          if (phase === 'setup')
            await assert.rejects(
              file.dispose(),
              /Cannot finish assertions with an active attempt/
            )
          else await file.dispose()
          assert.equal(file.getOperationSettlement().around.pending, 1)
        } finally {
          gate.resolve()
          await finished.promise
          await checkpoint()
        }
        assertSettled(file)
      }
    )
  }
  process.stdout.write(`${JSON.stringify({ checked })}\n`)
}
main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => rmSync(directory, { recursive: true, force: true }))
