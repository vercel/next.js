const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { initializeTestFile } = require(process.argv[2])
const { describe, test } = require(process.argv[3])

const directory = mkdtempSync(join(tmpdir(), 'next-completed-module-result-'))
const checked = []

async function withFile(name, load, verify) {
  const file = initializeTestFile({
    fileId: name,
    filePath: join(directory, `${name}.test.mjs`),
  })
  try {
    assert.equal(file.getCompletedModuleResult(), undefined)
    await file.collect(load)
    await verify(file)
  } finally {
    await file.dispose()
  }
  checked.push(name)
}

function options(extra) {
  return {
    runId: 'completed-module',
    signal: new AbortController().signal,
    ...extra,
  }
}

async function main() {
  await withFile(
    'capture-off',
    async () => {
      describe('nested', () => test('ordinary', () => {}))
    },
    async (file) => {
      const suites = []
      let observerReads = 0
      const runOptions = options()
      Object.defineProperty(runOptions, 'onSuiteEnd', {
        enumerable: true,
        get() {
          observerReads++
          return (result) => suites.push(result.suiteId)
        },
      })
      const result = await file.run(runOptions)
      assert.equal(result.interrupted, false)
      assert.deepEqual(
        result.cases.map((item) => item.status),
        ['passed']
      )
      assert.equal(suites.length, 2)
      assert.equal(suites[1], 'capture-off')
      assert.equal(observerReads, 1)
      assert.equal(file.getCompletedModuleResult(), undefined)
    }
  )
  await withFile(
    'root-duration',
    async () => {
      describe('nested', () => test('ordinary', () => {}))
    },
    async (file) => {
      const observed = []
      let observerReads = 0
      const runOptions = options({ captureCompletedModuleResult: true })
      Object.defineProperty(runOptions, 'onSuiteEnd', {
        enumerable: true,
        get() {
          observerReads++
          return (suite) => {
            observed.push([suite.suiteId, suite.durationMs])
            suite.durationMs = 987654321
          }
        },
      })
      const result = await file.run(runOptions)
      assert.equal(result.interrupted, false)
      assert.equal(observerReads, 1)
      const fact = file.getCompletedModuleResult()
      assert.equal(fact.version, 2)
      assert.equal(fact.durationMs, Math.max(observed[1][1], 0))
      assert.equal(observed[1][0], 'root-duration')
      assert.equal(fact.containsOnly, false)
      assert.equal(fact.interrupted, false)
      assert.equal(Object.isFrozen(fact), true)
      assert.equal(file.getCompletedModuleResult(), fact)
      assert.deepEqual(Object.keys(fact), [
        'version',
        'durationMs',
        'containsOnly',
        'interrupted',
        'finalState',
      ])
      await assert.rejects(
        file.run(options({ captureCompletedModuleResult: true })),
        /Cannot run test file in finished state/
      )
      assert.equal(file.getCompletedModuleResult(), fact)
    }
  )
  const failure = new Error('actual completed failed body')
  await withFile(
    'fulfilled-failure',
    async () => {
      test('failure', () => {
        throw failure
      })
    },
    async (file) => {
      const result = await file.run(
        options({ captureCompletedModuleResult: true })
      )
      assert.deepEqual(
        result.cases.map((item) => item.status),
        ['failed']
      )
      assert.equal(result.cases[0].errors[0].error, failure)
      assert.equal(result.interrupted, false)
      assert.equal(file.getCompletedModuleResult().version, 2)
      assert.equal(file.getCompletedModuleResult().interrupted, false)
    }
  )
  await withFile(
    'actual-focus',
    async () => {
      test.only('selected', () => {})
      test('unselected', () => {
        throw new Error('focus must prevent this body')
      })
    },
    async (file) => {
      const result = await file.run(
        options({ captureCompletedModuleResult: true, allowOnly: true })
      )
      assert.deepEqual(
        result.cases.map((item) => item.status),
        ['passed', 'skipped']
      )
      assert.equal(file.getCompletedModuleResult().containsOnly, true)
    }
  )
  await withFile(
    'name-filter',
    async () => {
      test('selected', () => {})
      test('unselected', () => {
        throw new Error('name filtering must prevent this body')
      })
    },
    async (file) => {
      const result = await file.run(
        options({
          captureCompletedModuleResult: true,
          testNamePattern: '^selected$',
        })
      )
      assert.deepEqual(
        result.cases.map((item) => item.status),
        ['passed', 'skipped']
      )
      assert.equal(file.getCompletedModuleResult().containsOnly, false)
    }
  )
  const cancellation = new AbortController()
  let cleaned = false
  await withFile(
    'fulfilled-interruption',
    async () => {
      test('cancelled', async ({ signal, onTestFinished }) => {
        onTestFinished(() => {
          cleaned = true
        })
        const cancelled = new Promise((resolve) =>
          signal.addEventListener('abort', resolve, { once: true })
        )
        cancellation.abort(new Error('actual scheduling interruption'))
        await cancelled
      })
    },
    async (file) => {
      const result = await file.run({
        ...options({ captureCompletedModuleResult: true }),
        signal: cancellation.signal,
      })
      assert.equal(result.interrupted, true)
      assert.deepEqual(
        result.cases.map((item) => item.status),
        ['cancelled']
      )
      assert.equal(cleaned, true)
      const fact = file.getCompletedModuleResult()
      assert.equal(fact.version, 2)
      assert.equal(fact.interrupted, true)
      assert.equal(fact.containsOnly, false)
      assert.equal(Number.isFinite(fact.durationMs), true)
      assert.equal(fact.durationMs >= 0, true)
      assert.equal(Object.isFrozen(fact), true)
    }
  )
  await withFile(
    'observer-rejected',
    async () => {
      test('ordinary', () => {})
    },
    async (file) => {
      const failure = new Error('root observer rejection')
      await assert.rejects(
        file.run(
          options({
            captureCompletedModuleResult: true,
            onSuiteEnd(suite) {
              if (suite.suiteId === 'observer-rejected') throw failure
            },
          })
        ),
        (error) => error === failure
      )
      assert.equal(file.getCompletedModuleResult(), undefined)
    }
  )
  await withFile(
    'observer-getter-rejected',
    async () => {
      test('ordinary', () => {})
    },
    async (file) => {
      const failure = new Error('root observer getter rejection')
      const runOptions = options({ captureCompletedModuleResult: true })
      Object.defineProperty(runOptions, 'onSuiteEnd', {
        enumerable: true,
        get() {
          throw failure
        },
      })
      await assert.rejects(file.run(runOptions), (error) => error === failure)
      assert.equal(file.getCompletedModuleResult(), undefined)
    }
  )
  let enter
  let release
  const entered = new Promise((resolve) => {
    enter = resolve
  })
  const gate = new Promise((resolve) => {
    release = resolve
  })
  await withFile(
    'pending-body',
    async () => {
      test('pending', async () => {
        enter()
        await gate
      })
    },
    async (file) => {
      const running = file.run(options({ captureCompletedModuleResult: true }))
      const settled = running.then(
        () => 'settled',
        (error) => {
          throw error
        }
      )
      // Observe a possible early rejection before waiting for authored entry.
      void settled.catch(() => {})
      try {
        assert.equal(
          await Promise.race([entered.then(() => 'entered'), settled]),
          'entered'
        )
        assert.equal(file.getCompletedModuleResult(), undefined)
      } finally {
        release()
        await running
      }
      assert.equal(file.getCompletedModuleResult().version, 2)
    }
  )
  const file = initializeTestFile({
    fileId: 'collection-rejected',
    filePath: join(directory, 'collection-rejected.test.mjs'),
  })
  try {
    const failure = new Error('collection rejection')
    await assert.rejects(
      file.collect(async () => {
        throw failure
      }),
      (error) => error === failure
    )
    assert.equal(file.getCompletedModuleResult(), undefined)
  } finally {
    await file.dispose()
  }
  checked.push('collection-rejected')
  process.stdout.write(`${JSON.stringify({ checked })}\n`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => rmSync(directory, { recursive: true, force: true }))
