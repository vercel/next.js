import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, name] = process.argv.slice(2),
  consumer = resolve(consumerArg),
  output = resolve(outputArg),
  load = createRequire(join(consumer, 'package.json'))
assert(consumerArg && outputArg && name)
if (!process.argv.includes('--source'))
  for (const module of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(module))
const row = JSON.parse(
  fs.readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/threshold-formatter-multiproject-pristine.json'
    )
  )
).rows.find((row) => row.name === name)
assert(row, 'Missing complete genuine root formatter model')
fs.mkdirSync(output, { recursive: true })
const fixture = fs.mkdtempSync(
    join(consumer, '.next-root-formatter-projects-')
  ),
  sha = (value) => createHash('sha256').update(value).digest('hex'),
  config = row.configTemplate.replaceAll('<OUTPUT_DIR>', output)
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
  for (const [file, value] of Object.entries(row.sourceFiles)) {
    assert.equal(sha(value.source), value.sha256)
    fs.writeFileSync(join(fixture, file), value.source)
  }
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
    NODE_ENV: row.mode,
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
  assertOwnedNodeCompleted(owner, 'root threshold formatter ' + name)
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
  const raw = JSON.parse(fs.readFileSync(join(output, 'cases.json'))),
    report = canonical(raw)
  assert.equal(raw.next.version, 1)
  assert.equal(
    raw.next.events.filter((e) => e.type === 'case-start').length,
    row.passed
  )
  delete report.next
  delete report.startTime
  for (const file of report.testResults) {
    delete file.startTime
    delete file.endTime
    for (const test of file.assertionResults) delete test.duration
  }
  assert.deepEqual(report, row.standardReport)
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
  assert.deepEqual(
    fs.readdirSync(join(output, 'coverage')).sort(),
    row.coverageFiles
  )
  for (const [file, expected] of Object.entries(row.completeCoverageReports)) {
    const bytes = fs.readFileSync(join(output, 'coverage', file), 'utf8')
    assert.deepEqual(
      canonical(file.endsWith('.json') ? JSON.parse(bytes) : bytes),
      expected
    )
  }
  for (const [file, value] of Object.entries(row.sourceFiles))
    assert.equal(sha(fs.readFileSync(join(fixture, file))), value.sha256)
  assert.deepEqual(fs.readdirSync(join(fixture, '__snapshots__')), [])
  fs.writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        name,
        node: process.version,
        projects: row.projects,
        passed: row.passed,
        orderedActualCallbacks: trace.length,
        undefinedReceiver: trace.every((row) => row.receiver),
        completeCasesJSONCoverageMapReportsAndFinalConfigBytesExact: true,
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
