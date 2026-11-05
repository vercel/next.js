import {
  assertCoverageCounters,
  assertCoverageReports,
} from './settled-coverage-assertions.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  readdirSync,
  copyFileSync,
} from 'node:fs'
import { join, dirname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg, profile] = process.argv.slice(2)
assert(consumerArg && outputArg && profile)
const consumer = resolve(consumerArg),
  output = resolve(outputArg)
const source = process.argv.includes('--source')
const load = createRequire(join(consumer, 'package.json'))
if (!source)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const pristine = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/istanbul-provider/spec-collection-pristine.json'
    )
  )
)
const row = pristine.rows.find((value) => value.name === profile)
assert(row, 'Missing genuine collection profile')
const fixture = mkdtempSync(join(consumer, '.next-istanbul-spec-collection-'))

const keys = [
  'ancestorTitles',
  'fullName',
  'status',
  'title',
  'failureMessages',
]
const cases = (report) =>
  report.testResults.map((file) => ({
    file: basename(file.name),
    status: file.status,
    message: file.message,
    cases: file.assertionResults.map((value) =>
      Object.fromEntries(
        keys
          .filter((key) => key in value)
          .map((key) => [
            key,
            key === 'failureMessages'
              ? value[key].map((message) => message.split('\n')[0])
              : value[key],
          ])
      )
    ),
  }))
mkdirSync(output, { recursive: true })
try {
  for (const [name, file] of Object.entries(row.sourceFiles)) {
    assert.equal(
      createHash('sha256').update(file.source).digest('hex'),
      file.sha256
    )
    writeFileSync(join(fixture, name), file.source)
  }
  writeFileSync(join(fixture, 'vitest.config.mjs'), row.config)
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  if (Object.keys(row.snapshots).length) {
    mkdirSync(join(fixture, '__snapshots__'))
    for (const [name, contents] of Object.entries(row.snapshots))
      writeFileSync(join(fixture, '__snapshots__', name), contents)
  }
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    CI: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
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
      source
        ? join(consumer, 'packages/next/dist/bin/next')
        : load.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--outputFile=' + join(output, 'cases.json'),
    ],
    { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'Istanbul collection ' + profile)
  assert.equal(owner.status, row.exitCode, owner.stderr)
  const report = JSON.parse(readFileSync(join(output, 'cases.json')))
  writeFileSync(
    join(output, 'SNAPSHOT-STATS.json'),
    JSON.stringify(
      {
        actual: report.snapshot,
        genuine: row.cases.snapshot,
        equal:
          JSON.stringify(report.snapshot) ===
          JSON.stringify(row.cases.snapshot),
      },
      null,
      2
    ) + '\n'
  )
  const authoredTrace = existsSync(join(fixture, 'authored-trace.jsonl'))
    ? readFileSync(join(fixture, 'authored-trace.jsonl'), 'utf8')
    : ''
  writeFileSync(join(output, 'authored-trace.jsonl'), authoredTrace)
  const traceEvents = (bytes) =>
    bytes
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
      .map(({ pid: _pid, ...event }) => event)
  assert.deepEqual(traceEvents(authoredTrace), traceEvents(row.authoredTrace))
  assert(!authoredTrace.includes('BODY_MUST_NOT_START'))
  assert.deepEqual(cases(report), cases(row.cases))
  assertCoverageCounters(report.coverageMap, fixture, row.coverage)
  assert.deepEqual(report.snapshot, row.cases.snapshot)
  assert.equal(report.numTotalTests, 0)
  assert(report.testResults.every((file) => file.assertionResults.length === 0))
  for (const key of [
    'numTotalTestSuites',
    'numPassedTestSuites',
    'numFailedTestSuites',
    'numPendingTestSuites',
    'numTotalTests',
    'numPassedTests',
    'numFailedTests',
    'numPendingTests',
    'numTodoTests',
    'success',
  ])
    assert.deepEqual(report[key], row.cases[key], key)
  assert.deepEqual(
    (existsSync(join(fixture, 'coverage'))
      ? readdirSync(join(fixture, 'coverage'))
      : []
    ).sort(),
    row.reportFiles.slice().sort()
  )
  mkdirSync(join(output, 'coverage'))
  if (row.reportFiles.length) {
    assertCoverageReports(
      join(fixture, 'coverage'),
      fixture,
      row.coverage,
      row.reportFiles
    )
    for (const name of row.reportFiles)
      copyFileSync(
        join(fixture, 'coverage', name),
        join(output, 'coverage', name)
      )
  }
  const snapshots = existsSync(join(fixture, '__snapshots__'))
    ? Object.fromEntries(
        readdirSync(join(fixture, '__snapshots__')).map((name) => [
          name,
          readFileSync(join(fixture, '__snapshots__', name), 'utf8'),
        ])
      )
    : {}
  assert.deepEqual(snapshots, row.snapshots)
  assert.equal(
    readFileSync(join(fixture, 'vitest.config.mjs'), 'utf8'),
    row.config
  )
  writeFileSync(
    join(output, 'SNAPSHOTS.json'),
    JSON.stringify(snapshots, null, 2) + '\n'
  )
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        actualPublicCLI: true,
        profile,
        actualSettledCollectionFailure: true,
        actualSpecModuleCollection: true,
        noAuthoredBodyExecution: true,
        actualJSONCoverageCounters: true,
        noCaseStartsInvented: true,
        rawWholeJSONQualified: false,
        reportOnFailure: !profile.endsWith('-report-false'),
        caseStatusesAndErrors: true,
        coverageCountersAndReportFiles: true,
        exactExistingSnapshots: true,
        configUnchanged: true,
        allOwnersJoined: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
  writeFileSync(
    join(output, 'CLOSED.json'),
    JSON.stringify({ fixtureRetired: !existsSync(fixture) }) + '\n'
  )
}
