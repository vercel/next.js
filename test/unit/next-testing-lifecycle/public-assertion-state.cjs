const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const runner = require('next/dist/experimental/testing/runner')
const api = require('next/dist/experimental/testing/vitest')
const directory = mkdtempSync(join(tmpdir(), 'next-public-assertion-state-'))
const checked = []

async function run(publicSelection, around) {
  const name = `${publicSelection ? 'public' : 'legacy'}-${around ? 'around' : 'hooks'}`
  const file = runner.initializeTestFile({
    ...(publicSelection ? { publicTaskSelection: true } : {}),
    fileId: name,
    filePath: join(directory, name + '.test.mjs'),
  })
  const rows = []
  let attempts = 0
  function row(phase) {
    const state = api.expect.getState()
    rows.push([
      phase,
      state.assertionCalls,
      state.expectedAssertionsNumber,
      state.currentTestName ?? null,
    ])
  }
  try {
    await file.collect(async () => {
      if (around) {
        api.aroundAll(async (runSuite) => {
          row('aroundAll:before')
          api.expect('suite').toBe('suite')
          await runSuite()
          row('aroundAll:after')
        })
        api.aroundEach(async (runTest) => {
          row('aroundEach:before')
          api.expect('prelude').toBe('prelude')
          await runTest()
          row('aroundEach:after')
        })
      }
      api.beforeAll(() => row('beforeAll'))
      api.beforeEach(() => {
        row('beforeEach')
        api.expect('setup').toBe('setup')
      })
      api.afterEach(() => {
        row('afterEach:before')
        api.expect('cleanup').toBe('cleanup')
        row('afterEach:after')
      })
      api.test('retry', { retry: 1 }, () => {
        row('body')
        api.expect.assertions(2)
        api.expect(++attempts).toBe(2)
      })
      api.afterAll(() => row('afterAll'))
    })
    const result = await file.run({
      runId: name,
      signal: new AbortController().signal,
    })
    assert.deepEqual(result.errors, [])
    assert.deepEqual(
      result.cases.map(({ status }) => status),
      ['failed', 'passed']
    )
    if (publicSelection) {
      assert.deepEqual(rows, [
        ...(around ? [['aroundAll:before', 0, null, null]] : []),
        ['beforeAll', around ? 1 : 0, null, null],
        ...(around ? [['aroundEach:before', 1, null, null]] : []),
        ['beforeEach', 0, null, 'retry'],
        ['body', 1, null, 'retry'],
        ['afterEach:before', 2, 2, 'retry'],
        ['afterEach:after', 3, 2, 'retry'],
        ...(around
          ? [
              ['aroundEach:after', 3, 2, 'retry'],
              ['aroundEach:before', 3, 2, 'retry'],
            ]
          : []),
        ['beforeEach', 0, null, 'retry'],
        ['body', 1, null, 'retry'],
        ['afterEach:before', 2, 2, 'retry'],
        ['afterEach:after', 3, 2, 'retry'],
        ...(around ? [['aroundEach:after', 3, 2, 'retry']] : []),
        ['afterAll', 3, 2, 'retry'],
        ...(around ? [['aroundAll:after', 3, 2, 'retry']] : []),
      ])
    } else {
      assert.deepEqual(rows, [
        ['beforeAll', 0, null, null],
        ['beforeEach', 0, null, 'retry'],
        ['body', 1, null, 'retry'],
        ['afterEach:before', 2, 2, 'retry'],
        ['afterEach:after', 3, 2, 'retry'],
        ['beforeEach', 0, null, 'retry'],
        ['body', 1, null, 'retry'],
        ['afterEach:before', 2, 2, 'retry'],
        ['afterEach:after', 3, 2, 'retry'],
        ['afterAll', 0, null, 'retry'],
      ])
    }
    checked.push(name)
  } finally {
    await file.dispose()
  }
}

async function main() {
  await run(false, false)
  await run(true, false)
  await run(true, true)
  console.log(JSON.stringify(checked))
}
main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => rmSync(directory, { recursive: true, force: true }))
