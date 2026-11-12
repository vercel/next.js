import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  copyFileSync,
} from 'node:fs'
import { dirname, resolve, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { resolveFixturePath } from '../../lib/next-testing-fixtures.cjs'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [profile, mode, sink, output, installedConsumer] = process.argv.slice(2)
assert(['default', 'default-json'].includes(sink))
const local = dirname(fileURLToPath(import.meta.url)),
  consumer = installedConsumer ?? resolve(local, '../../..'),
  require = createRequire(join(consumer, 'package.json')),
  cli = require.resolve('next/dist/bin/next')
if (installedConsumer)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => require.resolve(name), { code: 'MODULE_NOT_FOUND' })
const input = join(local, 'fixtures', 'snapshot-preparation-public', profile),
  expected = JSON.parse(readFileSync(join(input, 'expected.json'), 'utf8')),
  summary = JSON.parse(
    readFileSync(join(input, 'default-summary.json'), 'utf8')
  )
assert(['development', 'production'].includes(mode))
expected.mode = mode
expected.config.test.mode = mode
summary.mode = mode
assert.equal(expected.profile, profile)
assert.equal(expected.mode, mode)
assert.equal(summary.profile, profile)
assert.equal(summary.mode, mode)
const fixture = join(consumer, '.next-test-default-snapshot-' + randomUUID()),
  out = output + '.public'
mkdirSync(fixture)
mkdirSync(out)
copyFileSync(
  resolveFixturePath(join(input, 'modes.case.mjs.txt')),
  join(fixture, 'modes.case.mjs')
)
writeFileSync(
  join(fixture, 'vitest.config.mjs'),
  'export default ' + JSON.stringify(expected.config) + '\n'
)
writeFileSync(
  join(fixture, 'package.json'),
  ' {"private":true,"type":"module"}\n'
)
mkdirSync(join(fixture, '__snapshots__'))
const snapshotPath = join(fixture, '__snapshots__', 'modes.case.mjs.snap')
if (expected.snapshotFault === 'directory') mkdirSync(snapshotPath)
else
  writeFileSync(
    snapshotPath,
    '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n'
  )
const env = {
  ...process.env,
  NODE_ENV: mode,
  CI: '1',
  FORCE_COLOR: '0',
  NEXT_TELEMETRY_DISABLED: '1',
  TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
  MODE_TRACE: join(out, 'author.jsonl'),
  SNAPSHOT_OWNED_FILE: snapshotPath,
}
delete env.NODE_OPTIONS
delete env.NODE_PATH
try {
  const flags =
    sink === 'default'
      ? ['--reporter=default']
      : [
          '--reporter=default',
          '--reporter=json',
          '--outputFile=' + join(out, 'cases.json'),
        ]
  const result = await runOwnedNode([cli, 'test', fixture, ...flags], {
    cwd: fixture,
    env,
    auditDir: join(out, 'owners'),
    timeoutMs: 120000,
  })
  writeFileSync(
    join(out, 'RESULT.json'),
    JSON.stringify(result, null, 2) + '\n'
  )
  writeFileSync(join(out, 'stdout.log'), result.stdout)
  writeFileSync(join(out, 'stderr.log'), result.stderr)
  assertOwnedNodeCompleted(
    result,
    'actual public default snapshot ' + mode + ' ' + profile + ' ' + sink
  )
  const authors = readFileSync(join(out, 'author.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse),
    summaryLines = result.stdout
      .split('\n')
      .filter((line) => /^\s*(Test Files|Tests|Errors)\s/.test(line))
  let stable
  if (sink === 'default-json') {
    const json = JSON.parse(readFileSync(join(out, 'cases.json'), 'utf8'))
    stable = {
      counts: Object.fromEntries(
        Object.entries(json).filter(
          ([key]) => key.startsWith('num') || key === 'success'
        )
      ),
      snapshot: json.snapshot,
      files: json.testResults.map((file) => ({
        name: basename(file.name),
        status: file.status,
        message: file.message,
        assertionResults: file.assertionResults.map(
          ({ duration, ...test }) => test
        ),
      })),
    }
  }
  writeFileSync(
    join(out, 'OBSERVED.json'),
    JSON.stringify(
      { status: result.status, report: stable, authors, summaryLines },
      null,
      2
    ) + '\n'
  )
  assert.equal(result.status, expected.status)
  assert.deepEqual(summaryLines, summary.summaryLines)
  assert.deepEqual(authors, expected.authors)
  if (sink === 'default-json') assert.deepEqual(stable, expected.report)
  writeFileSync(
    output,
    JSON.stringify(
      {
        profile,
        mode,
        sink,
        wholeGenuineHumanSummaryEqual: true,
        completeReferenceJSONEqual: sink === 'default-json',
        unchangedAuthorRowsEqual: true,
        allPhysicalOwnersJoined: true,
        sdkAbsent: !!installedConsumer,
        noRawStderrParityClaim: true,
        execPath: process.execPath,
        version: process.version,
        versions: process.versions,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
