import assert from 'node:assert/strict'
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
import {
  publicModeConfig,
  publicModeExpectations,
} from './public-mode-contracts.mjs'
const [consumer, output, mode = 'development'] = process.argv.slice(2)
assert(consumer && output)
assert(['development', 'production'].includes(mode))
const require = createRequire(join(consumer, 'package.json'))
for (const name of ['vitest', 'vite', '@vitest/mocker'])
  assert.throws(() => require.resolve(name))
const cli = require.resolve('next/dist/bin/next')
const profiles = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/public-file-modes/pristine.json'
    ),
    'utf8'
  )
)
const reporter = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    'fixtures/public-mode-reporter.mjs'
  ),
  'utf8'
)
assert(!existsSync(output))
mkdirSync(output, { recursive: true })
const checks = []
for (const { profile, source, expected: contract } of profiles) {
  const expected = publicModeExpectations(contract)
  const out = join(output, profile),
    fixture = join(consumer, '.next-test-file-modes-' + randomUUID())
  mkdirSync(out)
  mkdirSync(fixture)
  writeFileSync(join(fixture, 'modes.case.mjs'), source)
  writeFileSync(join(fixture, 'reporter.mjs'), reporter)
  writeFileSync(
    join(fixture, 'package.json'),
    ' {"private":true,"type":"module"}\n'
  )
  writeFileSync(
    join(fixture, 'vitest.config.mjs'),
    'export default ' +
      JSON.stringify({ test: { ...publicModeConfig.test, mode } }) +
      '\n'
  )
  const env = {
    ...process.env,
    NODE_ENV: mode,
    CI: '1',
    FORCE_COLOR: '0',
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    MODE_TRACE: join(out, 'trace.jsonl'),
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
      'actual public modes ' + mode + ' ' + profile
    )
    assert.equal(result.status, expected.status, result.stderr)
    const rows = readFileSync(join(out, 'trace.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse)
    assert.deepEqual(
      rows.filter((row) => row.actor === 'reporter'),
      expected.reporterRows
    )
    assert.deepEqual(
      rows.filter((row) => row.actor === 'author'),
      expected.authoredRows
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
        assertionResults: file.assertionResults.map(({ duration, ...a }) => a),
      })),
    }
    assert.deepEqual(stable, expected.stable)
    checks.push({
      profile,
      wholeReporterGraphsEqual: true,
      completeReportAndSnapshotEqual: true,
      completeAuthoredEffectsEqual: true,
      allOwnersJoined: true,
    })
    writeFileSync(
      join(out, 'OBSERVED.json'),
      JSON.stringify({ rows, check: checks.at(-1) }, null, 2) + '\n'
    )
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
