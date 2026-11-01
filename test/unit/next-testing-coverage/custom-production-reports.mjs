import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, name] = process.argv.slice(2)
const consumer = resolve(consumerArg),
  output = resolve(outputArg),
  load = createRequire(join(consumer, 'package.json'))
assert(consumerArg && outputArg && name)
if (!process.argv.includes('--source'))
  for (const module of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(module))
const rows = JSON.parse(
  fs.readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/custom-production-pristine.json'
    )
  )
).rows
const row = rows.find((row) => row.name === name)
assert(row, 'Missing genuine production custom-provider model')
fs.mkdirSync(output, { recursive: true })
const fixture = fs.mkdtempSync(join(consumer, '.next-custom-production-')),
  sha = (value) => createHash('sha256').update(value).digest('hex')
let joined = false
try {
  for (const [file, value] of Object.entries(row.sourceFiles)) {
    assert.equal(sha(value.source), value.sha256)
    fs.writeFileSync(join(fixture, file), value.source)
  }
  fs.writeFileSync(join(fixture, 'package.json'), '{"type":"module"}\n')
  fs.writeFileSync(join(fixture, 'vitest.config.mjs'), row.config)
  fs.writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.mkdirSync(join(fixture, '__snapshots__'))
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: 'production',
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
      ...row.reporters.map(
        (value) =>
          '--reporter=' +
          (value.endsWith('.mjs') ? join(fixture, value) : value)
      ),
      ...(row.reporters.includes('json')
        ? ['--outputFile=' + join(fixture, 'cases.json')]
        : []),
    ],
    { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  fs.writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  fs.writeFileSync(join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'failed provider hook ' + name)
  joined = true
  for (const file of [
    'provider-trace.jsonl',
    'cases.json',
    'custom-coverage.json',
  ])
    if (fs.existsSync(join(fixture, file)))
      fs.copyFileSync(join(fixture, file), join(output, file))
  const actual = {
    name,
    exit: owner.status,
    trace: fs.existsSync(join(output, 'provider-trace.jsonl'))
      ? fs
          .readFileSync(join(output, 'provider-trace.jsonl'), 'utf8')
          .trim()
          .split('\n')
          .map((value) => JSON.parse(value))
      : [],
    hasJSON: fs.existsSync(join(output, 'cases.json')),
    hasProviderReport: fs.existsSync(join(output, 'custom-coverage.json')),
    providerReport: fs.existsSync(join(output, 'custom-coverage.json'))
      ? JSON.parse(fs.readFileSync(join(output, 'custom-coverage.json')))
      : null,
  }
  if (actual.hasJSON) {
    const report = JSON.parse(fs.readFileSync(join(output, 'cases.json')))
    assert.equal(report.next.version, 1)
    assert.equal(
      report.next.events.filter((event) => event.type === 'case-start').length,
      row.expected.caseCounts.passed + row.expected.caseCounts.failed
    )
    actual.actualJSONCoverageMap = report.coverageMap
    actual.caseCounts = {
      passed: report.numPassedTests,
      failed: report.numFailedTests,
    }
  }
  if (row.completeStandardReport) {
    const canonical = (value) =>
      typeof value === 'string'
        ? value.replaceAll(fixture, '<fixture>')
        : Array.isArray(value)
          ? value.map(canonical)
          : value && typeof value === 'object'
            ? Object.fromEntries(
                Object.entries(value).map(([key, v]) => [
                  key.replaceAll(fixture, '<fixture>'),
                  canonical(v),
                ])
              )
            : value
    const report = canonical(
      JSON.parse(fs.readFileSync(join(output, 'cases.json')))
    )
    delete report.next
    delete report.startTime
    for (const file of report.testResults) {
      delete file.startTime
      delete file.endTime
      for (const value of file.assertionResults) delete value.duration
    }
    actual.standardReport = report
  }
  fs.writeFileSync(
    join(output, 'ACTUAL-SCOPED-MODEL.json'),
    JSON.stringify(actual, null, 2) + '\n'
  )
  assert.deepEqual(actual, row.expected)
  for (const [file, value] of Object.entries(row.sourceFiles))
    assert.equal(sha(fs.readFileSync(join(fixture, file))), value.sha256)
  assert.equal(
    fs.readFileSync(join(fixture, 'vitest.config.mjs'), 'utf8'),
    row.config
  )
  assert.deepEqual(fs.readdirSync(join(fixture, '__snapshots__')), [])
  fs.writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        name,
        node: process.version,
        wholeCustomMapProviderReportAndHookTrace: true,
        actualCaseCounts: true,
        rawAuthoredErrorsPreservedWithoutNormalization: true,
        fullAuthoredErrorStackParityQualified: row.completeStandardReport,
        originalDeadlinesHeld: true,
        authoredSourcesAndSnapshotsHeld: true,
        allActualProcessesJoined: true,
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
