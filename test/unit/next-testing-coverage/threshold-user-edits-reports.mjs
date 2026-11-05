import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
import { assertSnapshotReport } from './snapshot-coverage-assertions.mjs'
const [consumerArg, outputArg, variant] = process.argv.slice(2),
  consumer = resolve(consumerArg),
  output = resolve(outputArg),
  load = createRequire(join(consumer, 'package.json'))
assert(consumerArg && outputArg && variant)
if (!process.argv.includes('--source'))
  for (const module of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(module))
const fixtureFiles = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/threshold-user-edits'
)
const expected = JSON.parse(
  fs.readFileSync(join(fixtureFiles, 'expected.json'))
)
const row = expected.rows.find((row) => row.variant === variant)
assert(row, 'Missing configuration edit scenario')
const sourceFiles = Object.fromEntries(
  ['subject.mjs', 'contract.test.mjs'].map((file) => [
    file,
    fs.readFileSync(join(fixtureFiles, file + '.txt'), 'utf8'),
  ])
)
fs.mkdirSync(output, { recursive: true })
const fixture = fs.mkdtempSync(join(consumer, '.next-threshold-user-edit-')),
  config = row.configTemplate
    .replaceAll('<FIXTURE_DIR>', fixture)
    .replaceAll('<OUTPUT_DIR>', output)
const canonical = (value) =>
  typeof value === 'string'
    ? value.replaceAll(fixture, '<fixture>').replaceAll(output, '<output>')
    : Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value).map(([key, value]) => [
              key.replaceAll(fixture, '<fixture>'),
              canonical(value),
            ])
          )
        : value
let joined = false
try {
  for (const [file, source] of Object.entries(sourceFiles))
    fs.writeFileSync(join(fixture, file), source)
  fs.writeFileSync(join(fixture, 'package.json'), ' {"type":"module"}\n')
  fs.writeFileSync(join(fixture, 'vitest.config.mjs'), config)
  fs.writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.mkdirSync(join(fixture, '__snapshots__'))
  fs.writeFileSync(join(output, 'before.mjs'), config)
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: 'development',
    FORCE_COLOR: '0',
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
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
      '--outputFile=' + join(output, 'cases.json'),
    ],
    { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  fs.writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  fs.writeFileSync(join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'actual formatter user edit ' + variant)
  joined = true
  if (fs.existsSync(join(fixture, 'coverage')))
    fs.cpSync(join(fixture, 'coverage'), join(output, 'coverage'), {
      recursive: true,
    })
  fs.writeFileSync(
    join(output, 'after.mjs'),
    fs.readFileSync(join(fixture, 'vitest.config.mjs'))
  )
  assert.equal(owner.status, row.status, owner.stderr)
  const report = JSON.parse(fs.readFileSync(join(output, 'cases.json')))
  assert.equal(report.next.version, 1)
  assert.equal(
    report.next.events.filter((e) => e.type === 'case-start').length,
    1
  )
  assert.equal(report.success, true)
  assert.equal(report.numTotalTests, 1)
  assert.equal(report.numTotalTestSuites, 1)
  assert.deepEqual(
    report.testResults.map((file) => file.status),
    ['passed']
  )
  assertSnapshotReport(report, {
    passed: 1,
    failed: 0,
    pending: 0,
    cases: [[expected.caseName, 'passed', []]],
    fileErrors: [''],
    snapshot: expected.snapshot,
  })
  const coverageMap = (map) =>
    canonical(
      Object.fromEntries(
        Object.entries(map).map(([name, { meta: _meta, ...coverage }]) => [
          name,
          coverage,
        ])
      )
    )
  assert.deepEqual(coverageMap(report.coverageMap), expected.coverageMap)
  const trace = fs
    .readFileSync(join(output, 'trace.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((value) => JSON.parse(value))
  assert.deepEqual(trace, row.trace)
  assert.equal(
    canonical(fs.readFileSync(join(fixture, 'vitest.config.mjs'), 'utf8')),
    row.after
  )
  for (const [name, key] of [
    ['edit-before.mjs', 'editBefore'],
    ['edit-after.mjs', 'editAfter'],
  ])
    if (row[key] !== undefined)
      assert.equal(
        canonical(fs.readFileSync(join(output, name), 'utf8')),
        row[key]
      )
    else assert(!fs.existsSync(join(output, name)))
  const coverage = join(output, 'coverage')
  assert.deepEqual(fs.readdirSync(coverage).sort(), [
    'coverage-final.json',
    'coverage-summary.json',
    'lcov.info',
  ])
  assert.deepEqual(
    coverageMap(
      JSON.parse(fs.readFileSync(join(coverage, 'coverage-final.json')))
    ),
    expected.coverageMap
  )
  assert.deepEqual(
    canonical(
      JSON.parse(fs.readFileSync(join(coverage, 'coverage-summary.json')))
    ),
    expected.coverageSummary
  )
  assert.equal(
    fs.readFileSync(join(coverage, 'lcov.info'), 'utf8'),
    expected.lcov
  )
  for (const [file, source] of Object.entries(sourceFiles))
    assert.equal(fs.readFileSync(join(fixture, file), 'utf8'), source)
  assert.deepEqual(fs.readdirSync(join(fixture, '__snapshots__')), [])
  fs.writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        variant,
        node: process.version,
        caseResultsCoverageFormatterOrderAndConfigEditsExact: true,
        sourceAndSnapshotsHeld: true,
        physicallyJoined: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  if (joined) fs.rmSync(fixture, { recursive: true, force: true })
  fs.writeFileSync(
    join(output, 'CLOSED.json'),
    JSON.stringify({
      physicallyJoined: joined,
      fixtureRetired: !fs.existsSync(fixture),
    }) + '\n'
  )
}
