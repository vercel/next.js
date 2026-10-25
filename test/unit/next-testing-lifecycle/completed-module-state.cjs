const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { initializeTestFile } = require(process.argv[2])
const { test, beforeAll, afterAll } = require(process.argv[3])
const directory = mkdtempSync(join(tmpdir(), 'next-module-state-'))
const checked = []

async function run(name, capture, load, verify, extra = {}) {
  const file = initializeTestFile({
    fileId: name,
    filePath: join(directory, name + '.test.mjs'),
  })
  try {
    await file.collect(load)
    const result = await file.run({
      runId: 'module-state',
      signal: new AbortController().signal,
      ...(capture ? { captureCompletedModuleResult: true } : {}),
      ...extra,
    })
    const fact = file.getCompletedModuleResult()
    if (capture) {
      assert.equal(fact.version, 2)
      assert.equal(Object.isFrozen(fact), true)
    } else assert.equal(fact, undefined)
    await verify(result, fact)
  } finally {
    await file.dispose()
  }
  checked.push(name)
}

async function main() {
  await run(
    'pass',
    true,
    () => test('ordinary', () => {}),
    (result, fact) => {
      assert.equal(fact.finalState, 'pass')
      assert.equal(result.errors.length, 0)
    }
  )
  await run(
    'body-failure',
    true,
    () =>
      test('ordinary', () => {
        throw new Error('actual body failure')
      }),
    (result, fact) => {
      assert.equal(fact.finalState, 'fail')
      assert.equal(result.cases[0].status, 'failed')
    }
  )
  await run(
    'afterAll-failure',
    true,
    () => {
      test('ordinary', () => {})
      afterAll(() => {
        throw new Error('actual afterAll failure')
      })
    },
    (result, fact) => {
      assert.equal(fact.finalState, 'fail')
      assert.equal(
        result.cases.filter((item) => item.status === 'failed').length,
        0
      )
      assert.equal(result.errors[0].phase, 'afterAll')
    }
  )
  await run(
    'beforeAll-failure',
    true,
    () => {
      beforeAll(() => {
        throw new Error('actual beforeAll failure')
      })
      test('ordinary', () => {
        throw new Error('must never run')
      })
    },
    (result, fact) => {
      assert.equal(fact.finalState, 'fail')
      assert.equal(result.cases[0].status, 'skipped')
    }
  )
  await run(
    'skipped',
    true,
    () => test.skip('ordinary', () => {}),
    (_result, fact) => {
      assert.equal(fact.finalState, 'skip')
    }
  )
  await run(
    'missing-root-result',
    true,
    () =>
      test('ordinary', ({ task }) => {
        delete task.file.result
      }),
    (_result, fact) => {
      assert.equal(fact.finalState, null)
    }
  )
  await run(
    'replaced-root-result',
    true,
    () =>
      test('ordinary', ({ task }) => {
        task.file.result = { state: 'todo' }
      }),
    (_result, fact) => {
      assert.equal(fact.finalState, 'pass')
    }
  )
  const reads = []
  for (const capture of [false, true]) {
    let count = 0,
      root,
      original
    await run(
      'root-getter-' + capture,
      capture,
      () =>
        test('ordinary', ({ task }) => {
          root = task.file
          original = root.result
          Object.defineProperty(root, 'result', {
            configurable: true,
            get() {
              count++
              return original
            },
          })
        }),
      (_result, fact) => {
        if (capture) assert.equal(fact.finalState, 'pass')
        reads.push(count)
        Object.defineProperty(root, 'result', {
          configurable: true,
          writable: true,
          value: original,
        })
      }
    )
  }
  assert.deepEqual(reads, [reads[0], reads[0]])
  assert.ok(reads[0] > 0)
  process.stdout.write(
    JSON.stringify({ checked, rootGetterReads: reads }) + '\n'
  )
}
main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => rmSync(directory, { recursive: true, force: true }))
