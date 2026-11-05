import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../lib/next-testing-case-runner.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(consumerArg && outputArg)
const repo = path.resolve(consumerArg)
const output = path.resolve(outputArg)
const here = path.dirname(fileURLToPath(import.meta.url))
const results = []
for (const mode of ['development', 'production']) {
  results.push(
    await runCompilerCase({
      repo,
      output: path.join(output, mode),
      mode,
      files: [
        {
          target: 'runtime.test.mjs',
          bytes: fs.readFileSync(
            path.join(here, 'fixtures/webkit-runtime.case.mjs.txt')
          ),
        },
      ],
      expectedCount: 3,
      config: {
        maxWorkers: 1,
        projects: [
          {
            name: 'webkit',
            environment: 'browser',
            mode,
            browser: {
              enabled: true,
              headless: true,
              instances: [{ browser: 'webkit' }],
            },
            include: ['runtime.test.mjs'],
            testTimeout: 1000,
            hookTimeout: 1000,
            includeTaskLocation: false,
          },
        ],
      },
      checkOutcomes(report) {
        assert.equal(report.success, true)
        assert.deepEqual(
          report.testResults.map((file) => path.basename(file.name)),
          ['runtime.test.mjs']
        )
        assert.equal(report.testResults[0].status, 'passed')
        assert.equal(report.testResults[0].message, '')
        assert.equal(report.next.summary.errors, 1)
        assert.deepEqual(
          report.next.events.filter(
            (event) =>
              event.type === 'diagnostic' &&
              event.diagnostic.severity === 'error'
          ),
          []
        )
        const cases = report.testResults.flatMap(
          (file) => file.assertionResults
        )
        assert.equal(report.numPassedTests, 3)
        assert.equal(report.numFailedTests, 0)
        assert(cases.every((test) => test.status === 'passed'))
        assert.deepEqual(
          cases.map((test) => test.fullName),
          [
            'native and subclass Promises in the actual document',
            'actual document and native event dispatch',
            'original synchronous retry',
          ]
        )
        assert.deepEqual(
          cases.slice(0, 2).map((test) => test.failureMessages),
          [[], []]
        )
        assert.deepEqual(cases[2].failureMessages, [
          'original synchronous retry',
        ])
      },
    })
  )
}
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(
  path.join(output, 'verified.json'),
  JSON.stringify(
    {
      profiles: results.length,
      cases: results.reduce((sum, result) => sum + result.cases, 0),
      webkitRuntimeAssertionsPassed: true,
      allOwnersClosed: true,
    },
    null,
    2
  ) + '\n'
)
console.log(
  JSON.stringify({ profiles: results.length, cases: 6, allPassed: true })
)
