import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../../lib/next-testing-case-runner.mjs'

const [consumerArg, outputArg, , kind] = process.argv.slice(2)
assert(consumerArg && outputArg)
assert(kind === undefined || kind === 'element-errors')
const repo = fs.realpathSync(consumerArg)
const output = path.resolve(outputArg)
const directory = path.dirname(fileURLToPath(import.meta.url))
const caseCounts = { formatting: 3, env: 2, effects: 3, 'element-errors': 5 }
const kinds = kind ? [kind] : ['formatting', 'env', 'effects', 'element-errors']
const runs = []
for (const mode of ['development', 'production']) {
  runs.push(
    await runCompilerCase({
      repo,
      output: path.join(output, mode),
      mode,
      files: [
        ...kinds.map((fixture) => ({
          target: fixture + '.test.mjs',
          bytes: fs.readFileSync(
            path.join(directory, fixture + '.test.mjs.txt')
          ),
        })),
        {
          target: 'dom-formatting.expected.json',
          bytes: fs.readFileSync(
            path.join(directory, 'dom-formatting.expected.json')
          ),
        },
      ],
      expectedCount: kinds.reduce(
        (total, fixture) => total + caseCounts[fixture],
        0
      ),
      check(report) {
        assert.equal(report.testResults.length, kinds.length)
        for (const fixture of kinds) {
          const file = report.testResults.find(
            (file) => path.basename(file.name) === fixture + '.test.mjs'
          )
          assert(file, 'Missing test file: ' + fixture)
          assert.equal(file.assertionResults.length, caseCounts[fixture])
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
    })
  )
}
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(
  path.join(output, 'VERIFIED.json'),
  JSON.stringify(
    {
      profiles: runs.length,
      cases: runs.reduce((total, run) => total + run.cases, 0),
      basicDOMBehaviorAssertionsPassed: true,
      allOwnersJoined: true,
      allFixturesRemoved: true,
      runs,
    },
    null,
    2
  ) + '\n'
)
