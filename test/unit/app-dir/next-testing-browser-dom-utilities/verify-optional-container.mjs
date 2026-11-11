import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../../lib/next-testing-case-runner.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(consumerArg && outputArg)
const repo = fs.realpathSync(consumerArg)
const output = path.resolve(outputArg)
const directory = path.dirname(fileURLToPath(import.meta.url))
const runs = []
for (const mode of ['development', 'production']) {
  runs.push(
    await runCompilerCase({
      repo,
      output: path.join(output, mode),
      mode,
      files: [
        {
          target: 'fixtures.test.mjs',
          bytes: fs.readFileSync(
            path.join(directory, 'optional-container.test.mjs.txt')
          ),
        },
        {
          target: 'optional-container.expected.json',
          bytes: fs.readFileSync(
            path.join(directory, 'optional-container.expected.json')
          ),
        },
      ],
      expectedCount: 21,
      timeoutMs: 120000,
      config: {
        test: {
          maxWorkers: 1,
          projects: ['aria', 'html', 'all'].map((format) => ({
            test: {
              name: 'dom-error-' + format,
              include: ['fixtures.test.mjs'],
              environment: 'browser',
              mode,
              browser: {
                enabled: true,
                headless: true,
                instances: [{ browser: 'chromium' }],
                locators: { errorFormat: format },
              },
              provide: { format },
              testTimeout: 5000,
              hookTimeout: 5000,
              includeTaskLocation: false,
            },
          })),
        },
      },
      check(report) {
        assert.equal(report.testResults.length, 3)
        assert(
          report.testResults.every((file) => file.assertionResults.length === 7)
        )
        assert.equal(report.numPassedTests, 21)
        assert.equal(report.numFailedTests, 0)
        assert.equal(report.numPendingTests, 0)
        for (const file of report.testResults) {
          assert.equal(file.message, '')
          for (const result of file.assertionResults) {
            assert.equal(result.status, 'passed', result.fullName)
            assert.deepEqual(result.failureMessages, [])
          }
        }
      },
    })
  )
}
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(
  path.join(output, 'VERIFIED.json'),
  JSON.stringify(
    {
      profiles: runs.length,
      projects: 6,
      cases: runs.reduce((total, run) => total + run.cases, 0),
      optionalContainerBehaviorAssertionsPassed: true,
      allOwnersJoined: true,
      allFixturesRemoved: true,
      runs,
    },
    null,
    2
  ) + '\n'
)
