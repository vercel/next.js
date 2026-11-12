import { resolveFixturePath } from '../../lib/next-testing-fixtures.cjs'
import { runCompilerCase } from '../../lib/next-testing-case-runner.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const [consumerArg, outputArg, mode = 'development', group = 'positive'] =
  process.argv.slice(2)
assert(['development', 'production'].includes(mode))
assert(
  ['positive', 'exact-multiple', 'load-failure', 'load-owned'].includes(group)
)
const repo = path.resolve(consumerArg)
const output = path.resolve(outputArg)
const inputs = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'normal-suite-records'
)
const observedFile = path.join(output, 'observed.json')
const result = await runCompilerCase({
  repo,
  output,
  mode,
  files: [
    {
      target: 'suite.test.mjs',
      bytes: fs.readFileSync(
        resolveFixturePath(path.join(inputs, `${group}.test.mjs.txt`))
      ),
    },
  ],
  expectedCount: group === 'positive' ? 6 : 0,
  expectedExit: group === 'positive' ? 0 : 1,
  config: {
    maxWorkers: 1,
    projects: [
      {
        name: 'normal-suite-api',
        mode,
        environment: 'node',
        include: ['suite.test.mjs'],
      },
    ],
  },
  env: { NEXT_SUITE_RETURN_OBSERVATION: observedFile },
  check: group === 'positive' ? checkReport : undefined,
  checkOutcomes: group === 'positive' ? undefined : checkReport,
})
function checkReport(report) {
  const positive = group === 'positive'
  const message = positive
    ? ''
    : group === 'load-owned'
      ? 'actual original module load failure'
      : 'same actual callback cause across distinct stages'
  const names = positive
    ? [
        'normal outer outer body',
        'normal outer normal inner inner body',
        'manual repeat manual child 1',
        'manual repeat manual child 2',
        'manual repeat manual child 3',
        'records actual normal collector operations',
      ]
    : []
  assert.equal(report.success, positive)
  assert.equal(report.numTotalTests, names.length)
  assert.equal(report.numPassedTests, names.length)
  assert.equal(report.numFailedTests, 0)
  assert.equal(report.numPendingTests, 0)
  assert.equal(report.numTodoTests, 0)
  assert.deepEqual(
    report.testResults.map((file) => ({
      status: file.status,
      message: file.message,
      cases: file.assertionResults.map(
        ({ fullName, status, failureMessages }) => ({
          fullName,
          status,
          failureMessages,
        })
      ),
    })),
    [
      {
        status: positive ? 'passed' : 'failed',
        message,
        cases: names.map((fullName) => ({
          fullName,
          status: 'passed',
          failureMessages: [],
        })),
      },
    ]
  )
  assert.deepEqual(
    report.next.events
      .filter((event) => event.type === 'diagnostic')
      .map(({ entryId, diagnostic }) => ({
        entryId,
        phase: diagnostic.phase,
        severity: diagnostic.severity,
        name: diagnostic.name,
        message: diagnostic.message,
      })),
    positive
      ? []
      : [
          {
            entryId: 'normal-suite-api:suite.test.mjs',
            phase: 'collection',
            severity: 'error',
            name: 'Error',
            message,
          },
        ]
  )
  if (positive) return
  const observed = JSON.parse(fs.readFileSync(observedFile))
  if (group === 'load-owned') {
    assert.deepEqual(observed.trace, [
      'before explicit collect',
      'owned factory entered',
      'after explicit collect',
      'before original load throw',
      'owned factory resumed',
      ['owned rejected', true],
    ])
  } else {
    assert.equal(observed.callbacks, group === 'load-failure' ? 0 : 1)
    assert.equal(observed.rawErrorFieldsUnchanged, true)
    if (group === 'exact-multiple')
      assert.equal(
        observed.message,
        'same actual callback cause across distinct stages'
      )
  }
}

fs.writeFileSync(
  path.join(output, 'CHECKS.json'),
  JSON.stringify({ ...result, group }) + '\n'
)
