import {
  assertSnapshotReport,
  assertSnapshotCoverage,
} from './snapshot-coverage-assertions.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
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
const source = process.argv.includes('--source')
const load = createRequire(join(consumer, 'package.json'))
if (!source)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const pristine = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/istanbul-provider/readonly-namefilter-pristine.json'
    )
  )
)
const row = pristine.rows.find((r) => r.name === profile)
assert(row, 'Unknown all-skipped profile')
const fixture = mkdtempSync(join(consumer, '.next-readonly-passing-public-'))
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
  for (const [name, source] of Object.entries(row.sourceFiles))
    writeFileSync(join(fixture, name), source)
  writeFileSync(join(fixture, 'package.json'), '{"type":"module"}\n')
  writeFileSync(join(fixture, 'vitest.config.mjs'), row.config)
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  mkdirSync(join(fixture, '__snapshots__'))
  for (const [name, bytes] of Object.entries(row.snapshots))
    writeFileSync(join(fixture, '__snapshots__', name), bytes)
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
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
  if (existsSync(join(fixture, 'coverage')))
    cpSync(join(fixture, 'coverage'), join(output, 'coverage'), {
      recursive: true,
    })
  const snapshots = Object.fromEntries(
    readdirSync(join(fixture, '__snapshots__')).map((name) => [
      name,
      readFileSync(join(fixture, '__snapshots__', name), 'utf8'),
    ])
  )
  writeFileSync(
    join(output, 'SNAPSHOT-BYTES.json'),
    JSON.stringify(snapshots, null, 2) + '\n'
  )
  assertOwnedNodeCompleted(
    owner,
    'actual readonly name-filter public ' + profile
  )
  assert.equal(owner.status, row.exitCode, owner.stderr)
  const actual = JSON.parse(readFileSync(join(output, 'cases.json')))
  assert.equal(actual.next.version, 1)
  const roots = actual.next.events.filter(
    (event) => event.type === 'suite-end' && event.suiteId === event.entryId
  )
  assert.equal(roots.length, 1)
  assert(actual.testResults.every((file) => file.assertionResults.length === 2))
  assert.equal(
    actual.next.events.filter((event) => event.type === 'case-start').length,
    row.selectedCases
  )
  assert.deepEqual(
    roots[0].errors.map(({ name, message }) => ({ name, message })),
    row.rootErrors
  )
  assertSnapshotReport(canonical(actual), row.expected)
  assert.deepEqual(snapshots, row.snapshots)
  if (row.reportOnFailure) {
    assertSnapshotCoverage(join(output, 'coverage'), fixture, row.coverage)
  } else assert.equal(existsSync(join(output, 'coverage')), false)
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        profile,
        actualSelectedCases: row.selectedCases,
        actualOrderedRootErrors: true,
        nextExtensionRetainedSeparately: true,
        caseOutcomesAndSnapshotSummary: true,
        selectedCoverageHitCounts: true,
        reportOnFailure: row.reportOnFailure,
        snapshotBytesUnchanged: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
