import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { join, dirname, basename } from 'node:path'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'
const [consumer, output, mode = 'development'] = process.argv.slice(2)
assert(consumer && output)
assert(['development', 'production'].includes(mode))
const require = createRequire(join(consumer, 'package.json'))
for (const name of ['vitest', 'vite', '@vitest/mocker'])
  assert.throws(() => require.resolve(name))
const cli = require.resolve('next/dist/bin/next')
const cases = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/empty-file-preparation/pristine.json'
    ),
    'utf8'
  )
)
assert(!existsSync(output))
mkdirSync(output, { recursive: true })
const checks = []
for (const fixtureCase of cases) {
  const {
    profile,
    sourceFiles,
    reporter,
    config,
    expected,
    originalReferenceError,
  } = fixtureCase
  const out = join(output, profile),
    fixture = join(consumer, '.next-test-empty-file-' + randomUUID())
  mkdirSync(out)
  mkdirSync(fixture)
  for (const [file, body] of Object.entries(sourceFiles))
    writeFileSync(join(fixture, file), body)
  writeFileSync(join(fixture, 'reporter.mjs'), reporter)
  writeFileSync(
    join(fixture, 'vitest.config.mjs'),
    'export default ' +
      JSON.stringify({ test: { ...config.test, mode, environment: 'node' } }) +
      '\n'
  )
  const env = {
    ...process.env,
    NODE_ENV: mode,
    CI: '1',
    FORCE_COLOR: '0',
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    QUEUED_TRACE: join(out, 'trace.jsonl'),
  }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  try {
    const result = await runOwnedNode(
      [
        cli,
        'test',
        fixture,
        '--reporter=./reporter.mjs',
        '--reporter=json',
        '--outputFile=' + join(out, 'cases.json'),
      ],
      { cwd: fixture, env, auditDir: join(out, 'owners'), timeoutMs: 120000 }
    )
    writeFileSync(
      join(out, 'RESULT.json'),
      JSON.stringify(result, null, 2) + '\n'
    )
    writeFileSync(join(out, 'stdout.log'), result.stdout)
    writeFileSync(join(out, 'stderr.log'), result.stderr)
    assertOwnedNodeCompleted(
      result,
      'actual empty public File ' + mode + ' ' + profile
    )
    assert.equal(
      result.status,
      fixtureCase.passWithNoTests ? 0 : 1,
      result.stderr
    )
    const rows = readFileSync(join(out, 'trace.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse)
    const clean = (row) =>
      Object.fromEntries(
        Object.entries(row)
          .filter(([k]) => k !== 'actor' && k !== 'id')
          .map(([k, v]) => [
            k,
            k === 'modules' ? v.map(({ id, ...module }) => module) : v,
          ])
      )
    const expectedForActualPath = (value) =>
      typeof value === 'string' &&
      originalReferenceError &&
      value === originalReferenceError
        ? 'No test suite found in file ' + join(fixture, 'a.case.mjs')
        : Array.isArray(value)
          ? value.map(expectedForActualPath)
          : value && typeof value === 'object'
            ? Object.fromEntries(
                Object.entries(value).map(([k, v]) => [
                  k,
                  expectedForActualPath(v),
                ])
              )
            : value
    const expectedRows = expectedForActualPath(expected.rows)
    const reporterEvents = new Set(['queued', 'collected', 'end', 'run-end'])
    assert.deepEqual(
      rows.filter((row) => row.actor === 'reporter').map(clean),
      expectedRows.filter((row) => reporterEvents.has(row.event))
    )
    assert.deepEqual(
      rows.filter((row) => row.actor === 'author').map(clean),
      expectedRows.filter((row) => !reporterEvents.has(row.event))
    )
    // Keep the stricter cross-process ordering observation visible. Its
    // Collected/beforeAll timing gap is independent of this producer's facts.
    const wholeCombinedTraceEqual = isDeepStrictEqual(
      rows.map(clean),
      expectedRows
    )
    const json = JSON.parse(readFileSync(join(out, 'cases.json'), 'utf8'))
    const stable = {
      counts: Object.fromEntries(
        Object.entries(json).filter(
          ([k]) => k.startsWith('num') || k === 'success'
        )
      ),
      snapshot: json.snapshot,
      files: json.testResults.map((file) => ({
        name: basename(file.name),
        status: file.status,
        message: file.message,
        assertionResults: file.assertionResults,
      })),
    }
    assert.deepEqual(stable, expectedForActualPath(expected.stableReport))
    const queued = rows.find((r) => r.event === 'queued'),
      end = rows.find((r) => r.event === 'end')
    assert.equal(queued.id, end.id)
    assert.equal(end.sameCollected, true)
    checks.push({
      profile,
      passWithNoTests: fixtureCase.passWithNoTests,
      wholeReporterRowsEqual: true,
      wholeAuthoredHookRowsEqual: true,
      wholeCombinedTraceEqual,
      completeStableReportAndSnapshotEqual: true,
      allOwnersJoined: true,
    })
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}
writeFileSync(
  join(output, 'VERIFIED.json'),
  JSON.stringify(
    {
      mode,
      profiles: checks.length,
      checks,
      allOwnersJoined: true,
      allInputsRemovedAfterOwnedReadersJoined: true,
    },
    null,
    2
  ) + '\n'
)
