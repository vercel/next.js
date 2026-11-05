import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(consumerArg && outputArg)
const consumer = path.resolve(consumerArg),
  output = path.resolve(outputArg)
const load = createRequire(path.join(consumer, 'package.json'))
const inputs = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/pure-node-v8-preservation'
)
const fixture = fs.mkdtempSync(path.join(consumer, '.next-pure-node-v8-'))
fs.mkdirSync(output, { recursive: true })
let joined = false
try {
  for (const file of ['body.test.mjs', 'subject.mjs'])
    fs.copyFileSync(path.join(inputs, file + '.txt'), path.join(fixture, file))
  fs.writeFileSync(path.join(fixture, 'package.json'), '{"type":"module"}\n')
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.test.config.json'),
    JSON.stringify({
      test: {
        include: ['body.test.mjs'],
        maxWorkers: 1,
        testTimeout: 1000,
        hookTimeout: 1000,
        coverage: {
          enabled: true,
          provider: 'v8',
          include: ['subject.mjs'],
          exclude: [],
          reporter: ['json', 'json-summary', 'lcovonly'],
          reportOnFailure: true,
        },
      },
    }) + '\n'
  )
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    FORCE_COLOR: '0',
  }
  for (const key of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[key]
  const owner = await runOwnedNode(
    [
      load.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--outputFile=' + path.join(output, 'cases.json'),
    ],
    {
      cwd: fixture,
      env,
      auditDir: path.join(output, 'owners'),
      timeoutMs: 120000,
    }
  )
  fs.writeFileSync(
    path.join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  fs.writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'V8 coverage after a failed async assertion')
  joined = true
  assert.equal(owner.status, 1, owner.stderr)
  const report = JSON.parse(fs.readFileSync(path.join(output, 'cases.json')))
  assert.equal(report.numTotalTests, 2)
  assert.equal(report.numPassedTests, 1)
  assert.equal(report.numFailedTests, 1)
  const tests = report.testResults.flatMap((file) => file.assertionResults)
  assert.deepEqual(
    tests.map((test) => [test.fullName, test.status]),
    [
      ['settled native body assertion', 'failed'],
      ['following body', 'passed'],
    ]
  )
  assert.match(tests[0].failureMessages.join('\n'), /was not awaited/)
  assert.match(tests[0].failureMessages.join('\n'), /body\.test\.mjs:4:\d+/)
  assert.deepEqual(tests[1].failureMessages, [])
  const coverageDir = path.join(fixture, 'coverage')
  const reports = ['coverage-final.json', 'coverage-summary.json', 'lcov.info']
  assert.deepEqual(fs.readdirSync(coverageDir).sort(), reports)
  const map = JSON.parse(
    fs.readFileSync(path.join(coverageDir, 'coverage-final.json'))
  )
  assert.deepEqual(
    Object.keys(map).map((file) => path.basename(file)),
    ['subject.mjs']
  )
  const counters = Object.values(map)[0]
  assert.deepEqual(counters.statementMap, {
    0: { start: { line: 1, column: 22 }, end: { line: 1, column: null } },
  })
  assert.deepEqual(counters.s, { 0: 1 })
  assert.deepEqual(counters.fnMap, {})
  assert.deepEqual(counters.branchMap, {})
  assert.deepEqual(counters.f, {})
  assert.deepEqual(counters.b, {})
  assert.deepEqual(report.coverageMap, map)
  const summary = JSON.parse(
    fs.readFileSync(path.join(coverageDir, 'coverage-summary.json'))
  )
  assert.equal(summary.total.lines.total, 1)
  assert.equal(summary.total.lines.covered, 1)
  assert.equal(summary.total.statements.pct, 100)
  assert.match(
    fs.readFileSync(path.join(coverageDir, 'lcov.info'), 'utf8'),
    /SF:subject\.mjs\nFNF:0\nFNH:0\nDA:1,1\nLF:1\nLH:1/
  )
  assert.equal(
    fs.readFileSync(path.join(fixture, 'subject.mjs'), 'utf8'),
    'export const marker = 1\n'
  )
  const result = {
    failedAsyncAssertionReported: true,
    followingCasePassed: true,
    exactOriginalSourceCoverage: true,
    sourceFrameLine: 4,
    reports: 3,
    ownersJoined: true,
  }
  fs.writeFileSync(
    path.join(output, 'CHECKS.json'),
    JSON.stringify(result, null, 2) + '\n'
  )
  console.log(JSON.stringify(result))
} finally {
  if (joined) fs.rmSync(fixture, { recursive: true, force: true })
  fs.writeFileSync(
    path.join(output, 'CLOSED.json'),
    JSON.stringify({ fixtureRetired: !fs.existsSync(fixture) }) + '\n'
  )
}
