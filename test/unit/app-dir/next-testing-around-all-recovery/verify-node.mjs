import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../../lib/next-testing-case-runner.mjs'

const [consumer, output, phase, variant, modeArg] = process.argv.slice(2)
assert(consumer && output)
assert(['setup', 'teardown'].includes(phase))
assert(['gated', 'root-gated'].includes(variant))
assert(!modeArg || ['development', 'production'].includes(modeArg))
fs.mkdirSync(output)
const source = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'node-records',
  variant + '.test.mjs.txt'
)
const profiles = []
for (const mode of modeArg ? [modeArg] : ['development', 'production']) {
  const directory = path.join(output, mode)
  const traceFile = path.join(directory, 'trace.jsonl')
  profiles.push(
    await runCompilerCase({
      repo: consumer,
      output: directory,
      mode,
      files: [{ target: 'suite.test.mjs', bytes: fs.readFileSync(source) }],
      expectedNames: ['affected body', 'following body'],
      expectedExit: 1,
      timeoutMs: 120000,
      config: {
        test: {
          mode,
          environment: 'node',
          include: ['suite.test.mjs'],
          maxWorkers: 1,
          fileParallelism: false,
          testTimeout: 5000,
          hookTimeout: 5000,
          includeTaskLocation: false,
        },
      },
      env: {
        AROUND_PHASE: phase,
        AROUND_FOLLOWUP: variant,
        AROUND_TRACE: traceFile,
      },
      checkOutcomes(report) {
        assert.equal(report.success, false)
        assert.deepEqual(
          report.testResults.map(({ status, message }) => ({
            status,
            message,
          })),
          [{ status: 'failed', message: '' }]
        )
        assert.equal(report.next.summary.errors, 1)
        assert.equal(report.next.summary.warnings, 0)
        const cases = report.testResults.flatMap(
          (file) => file.assertionResults
        )
        assert.deepEqual(
          cases.map((test) => test.status),
          [phase === 'setup' ? 'skipped' : 'passed', 'passed']
        )
        assert(cases.every((test) => test.failureMessages.length === 0))
        const suiteResults = report.next.events.filter(
          (event) => event.type === 'suite-end'
        )
        assert.deepEqual(
          suiteResults.map(({ name, status, errors }) => [
            name,
            status,
            errors.length,
          ]),
          [
            ['affected', 'failed', 1],
            ['following', 'passed', 0],
            ['', 'failed', 0],
          ]
        )
        assert(
          report.next.events
            .filter((event) => event.type === 'case-end')
            .every((event) => event.errors.length === 0)
        )
        const affected = suiteResults.find((suite) => suite.name === 'affected')
        const following = suiteResults.find(
          (suite) => suite.name === 'following'
        )
        assert.equal(affected.status, 'failed')
        assert.equal(affected.errors.length, 1)
        assert.equal(
          affected.errors[0].name,
          phase === 'setup' ? 'AroundHookSetupError' : 'AroundHookTeardownError'
        )
        assert.equal(
          affected.errors[0].message,
          `The ${phase} phase of "aroundAll" hook timed out after 100ms.`
        )
        const error = affected.errors[0]
        assert.equal(error.phase, 'runtime')
        assert.equal(error.severity, 'error')
        assert.deepEqual(
          report.next.events
            .filter((event) => event.type === 'diagnostic')
            .map(({ diagnostic }) => ({
              phase: diagnostic.phase,
              severity: diagnostic.severity,
              name: diagnostic.name,
              message: diagnostic.message,
            })),
          [
            {
              phase: 'runtime',
              severity: 'error',
              name: error.name,
              message: error.message,
            },
          ]
        )
        assert.equal(following.status, 'passed')
        assert.deepEqual(following.errors, [])
        const rows = fs
          .readFileSync(traceFile, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
        const events = rows.map((row) => row.event)
        const index = (event) => {
          const i = events.indexOf(event)
          assert(i >= 0, `${event} must run`)
          return i
        }
        assert(index('following-beforeAll-entry') < index('wrapper-finally'))
        assert(index('bounded-wait-settled') < index('wrapper-finally'))
        if (variant === 'root-gated') {
          assert(index('following-body-after') < index('wrapper-finally'))
          assert(index('root-afterAll-entry') < index('wrapper-finally'))
          assert(index('wrapper-finally') < index('root-afterAll-settled'))
        } else {
          assert(
            index('wrapper-finally') < index('following-beforeAll-settled')
          )
          assert(index('wrapper-finally') < index('following-body-before'))
        }
        if (phase === 'setup') assert(!events.includes('affected-beforeAll'))
        const count = phase === 'teardown' ? 1 : 0
        assert.deepEqual(rows.at(-1).counts, {
          affectedSetup: count,
          affectedBody: count,
          affectedCleanup: count,
          wrapper: 1,
          followingSetup: 1,
          followingBody: 1,
          followingCleanup: 1,
          ...(variant === 'root-gated' ? { rootCleanup: 1 } : {}),
        })
      },
    })
  )
}
const result = {
  allPassed: true,
  profiles,
  actualCases: profiles.reduce((sum, row) => sum + row.cases, 0),
  behavioralChecks: true,
  allRuntimeOwnersJoined: true,
}
fs.writeFileSync(
  path.join(output, 'VERIFIED.json'),
  JSON.stringify(result, null, 2) + '\n'
)
console.log(JSON.stringify(result))
