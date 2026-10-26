import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg, name] = process.argv.slice(2)
assert(consumerArg && outputArg && name)
const consumer = resolve(consumerArg)
const output = resolve(outputArg)
const source = process.argv.includes('--source')
const load = createRequire(join(consumer, 'package.json'))
if (!source)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const row = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/istanbul-provider/collection-snapshot-statistics-pristine.json'
    )
  )
).rows.find((row) => row.name === name)
assert(row, 'Missing genuine snapshot statistics profile')
const fixture = mkdtempSync(join(consumer, '.next-collection-snapshots-'))
const canonicalSnapshot = (value) => ({
  ...value,
  uncheckedKeysByFile: value.uncheckedKeysByFile.map((item) => ({
    ...item,
    filePath: basename(item.filePath),
  })),
})
const canonicalMap = (map) =>
  map &&
  Object.fromEntries(
    Object.entries(map).map(([file, value]) => [
      basename(file),
      { ...value, path: basename(value.path) },
    ])
  )
const caseFacts = (report) =>
  report.testResults.map((file) => ({
    file: basename(file.name),
    status: file.status,
    cases: file.assertionResults.map((item) => ({
      title: item.title,
      ancestorTitles: item.ancestorTitles,
      fullName: item.fullName,
      status: item.status,
    })),
  }))
mkdirSync(output, { recursive: true })
try {
  for (const [name, value] of Object.entries(row.authored.files)) {
    assert.equal(
      createHash('sha256').update(value.source).digest('hex'),
      value.sha256
    )
    writeFileSync(join(fixture, name), value.source)
  }
  writeFileSync(join(fixture, 'vitest.config.mjs'), row.authored.config)
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  mkdirSync(join(fixture, '__snapshots__'))
  for (const [name, bytes] of Object.entries(row.authored.snapshots))
    writeFileSync(join(fixture, '__snapshots__', name), bytes)
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    CI: '1',
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
  assertOwnedNodeCompleted(owner, 'collection snapshot statistics ' + name)
  assert.equal(owner.status, row.observed.exit, owner.stderr)
  const report = JSON.parse(readFileSync(join(output, 'cases.json')))
  assert.deepEqual(
    canonicalSnapshot(report.snapshot),
    canonicalSnapshot(row.report.snapshot)
  )
  assert.deepEqual(caseFacts(report), caseFacts(row.report))
  for (const key of [
    'numTotalTests',
    'numPassedTests',
    'numFailedTests',
    'numPendingTests',
    'numTodoTests',
    'success',
  ])
    assert.deepEqual(report[key], row.report[key], key)
  assert.deepEqual(
    canonicalMap(report.coverageMap),
    canonicalMap(row.report.coverageMap)
  )
  assert.equal(
    Object.hasOwn(report, 'coverageMap'),
    Object.hasOwn(row.report, 'coverageMap')
  )
  for (const [name, value] of Object.entries(row.authored.files))
    assert.equal(readFileSync(join(fixture, name), 'utf8'), value.source)
  for (const [name, bytes] of Object.entries(row.authored.snapshots))
    assert.equal(
      readFileSync(join(fixture, '__snapshots__', name), 'utf8'),
      bytes
    )
  assert.equal(
    readFileSync(join(fixture, 'vitest.config.mjs'), 'utf8'),
    row.authored.config
  )
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        name,
        completeSnapshotStatisticsExact: true,
        actualCaseAndFileStatusesExact: true,
        actualCoverageMapExact: true,
        failedCollectionNoCaseStarts: row.scenario.startsWith('failed-')
          ? report.testResults.every((file) => !file.assertionResults.length)
          : undefined,
        originalSourceConfigSnapshotBytesExact: true,
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
    JSON.stringify({ retired: true }) + '\n'
  )
}
