import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, profile] = process.argv.slice(2)
const consumer = path.resolve(consumerArg),
  output = path.resolve(outputArg),
  source = process.argv.includes('--source'),
  here = path.dirname(fileURLToPath(import.meta.url))
const load = createRequire(path.join(consumer, 'package.json'))
if (!source)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
assert(
  ['original', 'read', 'update', 'exercised', 'read-exercised'].includes(
    profile
  )
)
const inputs = path.join(here, 'fixtures/native-node-finished')
const exercised = profile.includes('exercised')
const hasSnapshot =
  profile === 'read' || profile === 'read-exercised' || profile === 'update'
const input = (name) => fs.readFileSync(path.join(inputs, name), 'utf8')
const entry = input('body.test.mjs.txt')
  .replace(
    '__SUBJECT_IMPORT__',
    exercised
      ? "import {read} from './subject.mjs';read()"
      : "import './subject.mjs'"
  )
  .replace(
    '__SNAPSHOT_ASSERTION__',
    hasSnapshot ? "expect('owned snapshot value').toMatchSnapshot()" : ''
  )
const expectedFailure = 'expected 1 to be 2 // Object.is equality'
const fixture = fs.mkdtempSync(
  path.join(consumer, '.next-native-node-finished-')
)
fs.mkdirSync(output, { recursive: true })
try {
  fs.writeFileSync(fixture + '/body.test.mjs', entry)
  fs.writeFileSync(
    fixture + '/subject.mjs',
    input(exercised ? 'subject-exercised.mjs.txt' : 'subject.mjs.txt')
  )
  fs.writeFileSync(fixture + '/package.json', '{"type":"module"}\n')
  fs.writeFileSync(
    fixture + '/next.config.mjs',
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.writeFileSync(
    fixture + '/vitest.config.mjs',
    input('vitest.config.mjs.txt').replace(
      '__COVERAGE_ENABLED__',
      profile === 'update' ? 'false' : 'true'
    )
  )
  if (hasSnapshot) {
    fs.mkdirSync(fixture + '/__snapshots__')
    fs.writeFileSync(
      fixture + '/__snapshots__/body.test.mjs.snap',
      input(profile === 'update' ? 'old.snap.txt' : 'owned.snap.txt')
    )
  }
  const trace = path.join(output, 'trace.jsonl')
  fs.writeFileSync(
    fixture + '/trace-reporter.mjs',
    "import{appendFileSync}from'node:fs'\nconst row=value=>appendFileSync(" +
      JSON.stringify(trace) +
      ",JSON.stringify(value)+'\\n')\nexport default class{onTestModuleEnd(module){row({event:'module-end',state:module.state(),errors:module.errors().map(error=>({name:error.name,message:error.message,stack:error.stack}))})}onTestRunEnd(modules,errors,reason){row({event:'run-end',reason,modules:modules.map(module=>({state:module.state(),errors:module.errors().map(error=>({name:error.name,message:error.message,stack:error.stack}))})),errors:errors.map(error=>({name:error.name,message:error.message,stack:error.stack,type:error.type}))})}}\n"
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
      source
        ? consumer + '/packages/next/dist/bin/next'
        : load.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      ...(profile === 'update' ? ['--update'] : []),
      '--reporter=json',
      '--reporter=./trace-reporter.mjs',
      '--outputFile=' + output + '/cases.json',
    ],
    { cwd: fixture, env, auditDir: output + '/owners', timeoutMs: 120000 }
  )
  fs.writeFileSync(
    output + '/OWNER.json',
    JSON.stringify(owner, null, 2) + '\n'
  )
  fs.writeFileSync(output + '/stdout.log', owner.stdout)
  fs.writeFileSync(output + '/stderr.log', owner.stderr)
  assertOwnedNodeCompleted(owner, 'public Node finished ' + profile)
  assert.equal(owner.status, 1, owner.stderr)
  const report = JSON.parse(fs.readFileSync(output + '/cases.json'))
  assert.equal(report.success, false)
  assert.equal(report.numTotalTests, 2)
  assert.equal(report.numPassedTests, 1)
  assert.equal(report.numFailedTests, 1)
  assert.equal(report.testResults.length, 1)
  assert.equal(report.testResults[0].status, 'failed')
  assert.equal(report.testResults[0].message, '')
  const tests = report.testResults.flatMap((file) => file.assertionResults)
  assert.deepEqual(
    tests.map(({ fullName, status }) => [fullName, status]),
    [
      ['settled native body assertion', 'failed'],
      ['following body', 'passed'],
    ]
  )
  assert.equal(tests[0].failureMessages.length, 1)
  assert.match(
    tests[0].failureMessages[0],
    /Promise returned by .* was not awaited/
  )
  assert.match(tests[0].failureMessages[0], /body\.test\.mjs:4:\d+/)
  assert.deepEqual(tests[1].failureMessages, [])
  const caseEvents = report.next.events.filter(
    (event) => event.type === 'case-end'
  )
  assert.equal(caseEvents[0].errors[0].phase, 'runtime')
  const unhandled = report.next.events.filter(
    (event) =>
      event.type === 'diagnostic' && event.diagnostic.unhandled === 'rejection'
  )
  assert.equal(unhandled.length, 1)
  assert.equal(unhandled[0].diagnostic.name, 'AssertionError')
  assert.equal(unhandled[0].diagnostic.message, expectedFailure)
  const actualTrace = fs
    .readFileSync(trace, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse)
  assert.deepEqual(
    actualTrace.map(({ event }) => event),
    ['module-end', 'run-end']
  )
  assert.equal(actualTrace[0].state, 'failed')
  assert.deepEqual(actualTrace[0].errors, [])
  assert.equal(actualTrace[1].reason, 'failed')
  assert.deepEqual(
    actualTrace[1].modules.map(({ state }) => state),
    ['failed']
  )
  assert.equal(actualTrace[1].errors.length, 1)
  assert.equal(actualTrace[1].errors[0].name, 'AssertionError')
  assert.equal(actualTrace[1].errors[0].message, expectedFailure)
  const reports = fs.existsSync(fixture + '/coverage')
    ? fs.readdirSync(fixture + '/coverage').sort()
    : []
  assert.deepEqual(
    reports,
    profile === 'update'
      ? []
      : ['coverage-final.json', 'coverage-summary.json', 'lcov.info']
  )
  if (profile !== 'update') {
    const summary = JSON.parse(
      fs.readFileSync(fixture + '/coverage/coverage-summary.json')
    ).total
    for (const metric of ['lines', 'statements']) {
      assert.equal(summary[metric].total, 1)
      assert.equal(summary[metric].covered, 1)
      assert.equal(summary[metric].pct, 100)
    }
    assert.equal(summary.functions.total, exercised ? 1 : 0)
    assert.equal(summary.functions.covered, exercised ? 1 : 0)
    const map = Object.values(
      JSON.parse(fs.readFileSync(fixture + '/coverage/coverage-final.json'))
    )
    assert.equal(map.length, 1)
    assert.equal(path.basename(map[0].path), 'subject.mjs')
    assert.deepEqual(Object.values(map[0].s), [1])
    assert.deepEqual(Object.values(map[0].f), exercised ? [1] : [])
    assert.deepEqual(map[0].b, {})
    const lcov = fs
      .readFileSync(fixture + '/coverage/lcov.info', 'utf8')
      .split('\n')
    assert(lcov.includes('SF:subject.mjs'))
    assert(lcov.includes('DA:1,1'))
    assert(lcov.includes(`FNH:${exercised ? 1 : 0}`))
  }
  const snapshots = fs.existsSync(fixture + '/__snapshots__')
    ? Object.fromEntries(
        fs
          .readdirSync(fixture + '/__snapshots__')
          .map((name) => [
            name,
            fs.readFileSync(fixture + '/__snapshots__/' + name, 'utf8'),
          ])
      )
    : {}
  assert.deepEqual(
    snapshots,
    hasSnapshot ? { 'body.test.mjs.snap': input('owned.snap.txt') } : {}
  )
  fs.writeFileSync(
    output + '/SNAPSHOTS.json',
    JSON.stringify(snapshots, null, 2) + '\n'
  )
  fs.writeFileSync(
    output + '/CHECKS.json',
    JSON.stringify(
      {
        profile,
        actualPublicNode: true,
        caseOutcomesAndFailureMessage: true,
        authoredFailureLocation: true,
        actualNativeErrorChannel: true,
        coverageCountsAndPublication: true,
        exactSnapshotBytes: true,
        allOwnersJoined: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  fs.rmSync(fixture, { recursive: true, force: true })
  fs.writeFileSync(
    output + '/CLOSED.json',
    JSON.stringify({ fixtureRetired: !fs.existsSync(fixture) }) + '\n'
  )
}
