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
const messages = JSON.parse(
  fs.readFileSync(path.join(directory, 'error-format.expected.json'))
)
fs.mkdirSync(output, { recursive: true })
const runs = []
for (const mode of ['development', 'production']) {
  runs.push(
    await runCompilerCase({
      repo,
      output: path.join(output, mode),
      mode,
      files: ['error-format-state', 'test-id-attribute-state'].map(
        (fixture) => ({
          target: fixture + '.test.mjs',
          bytes: fs.readFileSync(
            path.join(directory, fixture + '.test.mjs.txt')
          ),
        })
      ),
      expectedCount: 18,
      check(report) {
        assert.equal(report.testResults.length, 2)
        for (const [name, count] of [
          ['error-format-state', 14],
          ['test-id-attribute-state', 4],
        ]) {
          const file = report.testResults.find(
            (file) => path.basename(file.name) === name + '.test.mjs'
          )
          assert(file, 'Missing test file: ' + name)
          assert.equal(file.assertionResults.length, count)
          assert.equal(file.message, '')
          for (const result of file.assertionResults) {
            assert.equal(result.status, 'passed', result.fullName)
            assert.deepEqual(result.failureMessages, [])
          }
        }
      },
      timeoutMs: 120000,
      config: {
        test: {
          include: ['*.test.mjs'],
          maxWorkers: 1,
          environment: 'browser',
          mode,
          provide: { formatMessages: messages },
          browser: {
            enabled: true,
            headless: true,
            locators: { errorFormat: 'all', testIdAttribute: 'data-qa' },
            instances: [{ browser: 'chromium' }],
          },
          testTimeout: 5000,
          hookTimeout: 5000,
          includeTaskLocation: false,
        },
      },
    })
  )
}
fs.writeFileSync(
  path.join(output, 'VERIFIED.json'),
  JSON.stringify(
    {
      profiles: runs.length,
      cases: runs.reduce((total, run) => total + run.cases, 0),
      locatorConfigurationAssertionsPassed: true,
      allOwnersJoined: true,
      allFixturesRemoved: true,
      runs,
    },
    null,
    2
  ) + '\n'
)
