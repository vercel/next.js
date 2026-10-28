import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  cpSync,
} from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, profile] = process.argv.slice(2)
const consumer = resolve(consumerArg),
  output = resolve(outputArg)
const load = createRequire(join(consumer, 'package.json'))
if (!process.argv.includes('--source'))
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const row = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/istanbul-provider/readonly-namefilter-excluded-pristine.json'
    )
  )
).rows.find((r) => r.name === profile)
assert(row, 'Missing genuine excluded descendant profile')
const fixture = mkdtempSync(join(consumer, '.next-namefilter-excluded-'))
const canonical = (value) => {
  if (typeof value === 'string') return value.replaceAll(fixture, '<fixture>')
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [
        key.replaceAll(fixture, '<fixture>'),
        canonical(value),
      ])
    )
  return value
}
mkdirSync(output, { recursive: true })
try {
  for (const [name, file] of Object.entries(row.sourceFiles)) {
    assert.equal(
      createHash('sha256').update(file.source).digest('hex'),
      file.sha256
    )
    writeFileSync(join(fixture, name), file.source)
  }
  writeFileSync(join(fixture, 'package.json'), '{"type":"module"}\n')
  writeFileSync(join(fixture, 'vitest.config.mjs'), row.config)
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  writeFileSync(join(fixture, 'reporter.mjs'), row.reporter)
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    MODE_TRACE: join(output, 'trace.jsonl'),
  }
  for (const name of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[name]
  const owner = await runOwnedNode(
    [
      load.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      '--reporter=./reporter.mjs',
      '--reporter=json',
      '--outputFile=' + join(output, 'cases.json'),
      ...row.flags,
    ],
    { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  cpSync(join(fixture, 'coverage'), join(output, 'coverage'), {
    recursive: true,
  })
  assertOwnedNodeCompleted(
    owner,
    'actual name-filter untouched descendants ' + profile
  )
  assert.equal(owner.status, row.exitCode, owner.stderr)
  const raw = JSON.parse(readFileSync(join(output, 'cases.json')))
  assert.equal(raw.next.version, 1)
  assert.equal(
    raw.next.events.filter((event) => event.type === 'case-start').length,
    0
  )
  const report = canonical(raw)
  delete report.next
  delete report.startTime
  for (const file of report.testResults) {
    delete file.startTime
    delete file.endTime
    for (const test of file.assertionResults) delete test.duration
  }
  assert.deepEqual(report, row.standardReport)
  const trace = readFileSync(join(output, 'trace.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse)
  assert.deepEqual(trace, row.trace)
  assert.deepEqual(
    readdirSync(join(output, 'coverage')).sort(),
    Object.keys(row.coverageFiles).sort()
  )
  for (const [name, expected] of Object.entries(row.coverageFiles)) {
    const bytes = readFileSync(join(output, 'coverage', name), 'utf8')
    assert.deepEqual(
      canonical(name.endsWith('.json') ? JSON.parse(bytes) : bytes),
      expected
    )
  }
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        profile,
        actualCaseStarts: 0,
        completeStandardReportAndMap: true,
        wholeReporterTreeAndAuthorStream: true,
        untouchedPendingDescendants: true,
        completeCoverageFiles: true,
        nativeAndPhysicalJoinsHeld: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
