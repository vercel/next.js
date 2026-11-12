import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../../lib/next-testing-case-runner.mjs'
import { resolveFixturePath } from '../../../lib/next-testing-fixtures.cjs'

const [consumerArg, mode, outputArg] = process.argv.slice(2)
assert(
  process.argv.length === 5 &&
    consumerArg &&
    outputArg &&
    ['development', 'production'].includes(mode),
  'Expected consumer, mode, and output directory'
)
const consumer = fs.realpathSync(consumerArg)
const output = path.resolve(outputArg)
const corpus = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'browser-hook-parameters'
)
const phases = {
  'valid-success': [
    'beforeAll',
    'beforeEach',
    'renamedBeforeEach',
    'test',
    'afterEach',
    'afterAll',
  ],
  'valid-suite-empty': [
    'plainBeforeAll',
    'emptyBeforeAll',
    'test',
    'plainAfterAll',
    'emptyAfterAll',
  ],
}
const runs = []
fs.mkdirSync(output, { recursive: true })
for (const [id, expectedPhases] of Object.entries(phases)) {
  let rows
  await runCompilerCase({
    repo: consumer,
    output: path.join(output, id),
    mode,
    files: [
      {
        target: 'fixtures.test.mjs',
        bytes: fs.readFileSync(
          resolveFixturePath(
            path.join(corpus, 'fixtures', id + '.test.mjs.txt')
          )
        ),
      },
    ],
    expectedCount: 1,
    config: {
      test: {
        environment: 'browser',
        mode,
        maxWorkers: 1,
        include: ['fixtures.test.mjs'],
        browser: {
          enabled: true,
          headless: true,
          instances: [{ browser: 'chromium' }],
        },
        testTimeout: 5000,
        hookTimeout: 5000,
        includeTaskLocation: false,
      },
    },
    check(report) {
      const cases = report.testResults.flatMap((file) => file.assertionResults)
      assert.equal(report.success, true)
      assert.equal(cases.length, 1)
      assert.equal(cases[0].status, 'passed')
      assert.deepEqual(cases[0].failureMessages, [])
      assert.equal(report.next.summary.errors, 0)
      assert.deepEqual(
        report.next.events.filter(
          (event) =>
            event.type === 'diagnostic' && event.diagnostic.severity === 'error'
        ),
        []
      )
      const prefix = 'BROWSER_NATIVE_FIXTURE:'
      rows = report.next.events
        .filter((event) => event.type === 'output')
        .flatMap((event) =>
          event.text
            .split('\n')
            .filter((line) => line.startsWith(prefix))
            .map((line) => JSON.parse(line.slice(prefix.length)))
        )
      assert.deepEqual(
        rows.map((row) => row.phase),
        expectedPhases
      )
    },
  })
  runs.push({ id, mode, cases: 1, rows: rows.length })
}
fs.writeFileSync(
  path.join(output, 'VERIFIED.json'),
  JSON.stringify(
    {
      mode,
      profiles: runs.length,
      cases: runs.length,
      rows: runs.reduce((total, run) => total + run.rows, 0),
      runs,
      behaviorAssertions: true,
      allOwnersJoined: true,
      allFixturesRemoved: true,
    },
    null,
    2
  ) + '\n'
)
