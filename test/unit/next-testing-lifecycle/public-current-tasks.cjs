const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { setImmediate } = require('node:timers')
const runner = require('next/dist/experimental/testing/runner')
const facade = require('next/dist/experimental/testing/vitest')
const {
  getFinalCaseResults,
} = require('next/dist/experimental/testing/reporting/final-cases')
const directory = mkdtempSync(join(tmpdir(), 'next-public-current-tasks-'))
const results = []

async function run(variant) {
  const fileId = `public-current-${variant}`
  const file = runner.initializeTestFile({
    publicTaskSelection: true,
    fileId,
    filePath: join(directory, variant + '.test.mjs'),
  })
  const rows = []
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const firstCloses =
    variant === 'first-closes' ||
    variant === 'selected-retry' ||
    variant === 'first-skip'
  const pending = variant.endsWith('-skip')
  let firstAttempt = 0
  let secondAttempt = 0
  const tasks = new Map()
  function probe(stage, context) {
    const current = runner.getCurrentTest()
    const visible = runner.getConsoleTask()
    const actual = runner.getActiveAttempt()
    const globalTask = facade.chai.util.flag(facade.expect(0), 'vitest-test')
    assert.equal(globalTask, current)
    if (context) {
      assert.equal(actual.testId, context.task.id)
      assert.equal(
        facade.chai.util.flag(context.expect(0), 'vitest-test'),
        context.task
      )
      if (visible?.caseId === actual.testId) {
        assert.deepEqual(visible.attempt, {
          id: actual.id,
          retry: actual.retry,
          repeat: actual.repeat,
        })
      } else {
        assert.equal(visible?.attempt, undefined)
      }
    }
    rows.push({
      stage,
      current: current?.name ?? null,
      consoleId: visible?.taskId ?? null,
      owner: context?.task.name ?? null,
    })
    return visible
  }
  try {
    await file.collect(async () => {
      assert.deepEqual(runner.getConsoleTask(), { taskId: fileId })
      assert.equal(runner.getCurrentTest(), undefined)
      facade.describe('parent', () => {
        facade.beforeAll(() => {
          assert.equal(runner.getCurrentTest(), undefined)
          probe('beforeAll')
        })
        facade.beforeEach((context) => {
          tasks.set(context.task.name, context.task)
          probe('beforeEach', context)
        })
        facade.afterEach((context) => probe('afterEach', context))
        facade.afterAll(() => {
          assert.equal(runner.getCurrentTest(), undefined)
          probe('afterAll')
        })
        const firstOptions =
          variant === 'retry'
            ? { retry: 1 }
            : variant === 'repeat'
              ? { repeats: 1 }
              : {}
        facade.test.concurrent('first', firstOptions, async (context) => {
          const attempt = firstAttempt++
          const retained = facade.expect(Promise.resolve(7))
          probe('first-enter-' + attempt, context)
          if (firstCloses) {
            context.onTestFinished(() => {
              setImmediate(release)
            })
            if (pending) context.skip('first pending')
            return
          }
          await gate
          await resumed('first-after-second-' + attempt, context, retained)
          if (variant === 'retry' && attempt === 0)
            context.expect('retry').toBe('second attempt')
        })
        facade.test.concurrent(
          'second',
          variant === 'selected-retry' ? { retry: 1 } : {},
          async (context) => {
            const attempt = secondAttempt++
            const retained = facade.expect(Promise.resolve(7))
            probe('second-enter-' + attempt, context)
            if (!firstCloses) {
              context.onTestFinished(() => {
                setImmediate(release)
              })
              if (pending) context.skip('second pending')
              return
            }
            await gate
            await resumed('second-after-first-' + attempt, context, retained)
            if (variant === 'selected-retry' && attempt === 0)
              context.expect('retry').toBe('second attempt')
          }
        )
      })
    })
    async function resumed(stage, context, retained) {
      const visible = probe(stage, context)
      assert.equal(runner.getCurrentTest(), undefined)
      assert.equal(
        visible.taskId,
        pending ? tasks.get('second').id : context.task.suite.id
      )
      await facade.expect(Promise.resolve(7)).resolves.toBe(7)
      await retained.resolves.toBe(7)
      await context.expect(Promise.resolve(7)).resolves.toBe(7)
      assert.throws(() => facade.onTestFinished(() => {}), {
        message: 'Hook onTestFinished() can only be called inside a test',
      })
      assert.throws(() => facade.onTestFailed(() => {}), {
        message: 'Hook onTestFailed() can only be called inside a test',
      })
      context.onTestFinished(() => {
        probe(stage + '-finished', context)
      })
    }
    const result = await file.run({
      runId: variant,
      signal: new AbortController().signal,
    })
    assert.deepEqual(result.errors, [])
    assert.deepEqual(
      [...getFinalCaseResults(result.cases).values()].map(
        (test) => test.status
      ),
      pending ? ['skipped', 'passed'] : ['passed', 'passed']
    )
    assert.equal(runner.getCurrentTest(), undefined)
    assert.equal(runner.getConsoleTask(), undefined)
    results.push({
      variant,
      cases: result.cases.length,
      rows: rows.length,
      privateOwnerHeld: true,
      mismatchedAttemptOmitted: true,
    })
  } finally {
    await file.dispose()
  }
}

async function verifyConsoleMetadata() {
  const {
    installTestConsole,
  } = require('next/dist/experimental/testing/execution/console')
  const selected = { taskId: 'selected', caseId: 'selected' }
  const first = Object.freeze({
    ...selected,
    attempt: Object.freeze({ id: 'try0', retry: 0, repeat: 0 }),
  })
  const next = Object.freeze({
    ...selected,
    attempt: Object.freeze({ id: 'try1', retry: 1, repeat: 0 }),
  })
  const without = Object.freeze({ ...selected })
  const cases = [
    ['same-origin', [first, first, first], first.attempt],
    ['without-then-with', [without, first, first], undefined],
    ['matching-foreign-matching', [first, without, first], undefined],
    ['different-attempts', [first, next, first], undefined],
  ]
  const checked = []
  for (const [name, states, expected] of cases) {
    const held = JSON.stringify(states)
    const outputs = []
    let writes = 0
    const bridge = installTestConsole({
      fileId: 'file',
      getTask: () => states[writes++],
      publish: async (output) => {
        outputs.push(output)
      },
    })
    try {
      console.log('first')
      console.log('second')
      console.log('third')
    } finally {
      await bridge.dispose()
    }
    assert.equal(writes, 3)
    assert.equal(outputs.length, 1)
    assert.equal(outputs[0].caseId, selected.caseId)
    assert.deepEqual(outputs[0].console, { taskId: selected.taskId, size: 3 })
    assert.equal(outputs[0].text, 'first\nsecond\nthird\n')
    assert.equal(outputs[0].stream, 'stdout')
    assert.equal(Number.isFinite(outputs[0].timestamp), true)
    assert.deepEqual(outputs[0].attempt, expected)
    assert.equal(JSON.stringify(states), held)
    checked.push(name)
  }
  return checked
}

async function main() {
  for (const variant of [
    'first-closes',
    'second-closes',
    'retry',
    'repeat',
    'selected-retry',
    'first-skip',
    'second-skip',
  ])
    await run(variant)
  const consoleMetadata = await verifyConsoleMetadata()
  console.log(JSON.stringify({ results, consoleMetadata }))
}
main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => rmSync(directory, { recursive: true, force: true }))
