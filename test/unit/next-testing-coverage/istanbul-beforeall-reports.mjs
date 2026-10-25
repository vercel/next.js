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
      'fixtures/istanbul-provider/beforeall-pristine.json'
    )
  )
)
const row = pristine.rows.find((value) => value.name === profile)
assert(row, 'Missing genuine beforeAll profile')
const fixture = mkdtempSync(join(consumer, '.next-istanbul-beforeall-'))
const canonical = (map) =>
  Object.fromEntries(
    Object.entries(map).map(([file, data]) => [
      file === 'total' ? file : basename(file),
      { ...data, ...('path' in data ? { path: basename(data.path) } : {}) },
    ])
  )
const keys = [
  'ancestorTitles',
  'fullName',
  'status',
  'title',
  'failureMessages',
  'meta',
  'tags',
  'benchmarks',
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
  assertOwnedNodeCompleted(owner, 'Istanbul beforeAll ' + profile)
  assert.equal(owner.status, row.exitCode, owner.stderr)
  const report = JSON.parse(readFileSync(join(output, 'cases.json')))
  assert.deepEqual(cases(report), cases(row.cases))
  for (const key of [
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
    Object.keys(row.reports).sort()
  )
  mkdirSync(join(output, 'coverage'))
  for (const [name, expected] of Object.entries(row.reports)) {
    const actual = readFileSync(join(fixture, 'coverage', name), 'utf8')
    if (name.endsWith('.json'))
      assert.deepEqual(
        canonical(JSON.parse(actual)),
        canonical(JSON.parse(expected))
      )
    else assert.equal(actual, expected, name)
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
        actualSettledBeforeAllFailure: true,
        reportOnFailure: !profile.endsWith('-report-false'),
        wholeCaseProjection: true,
        completeMapsSummaryLCOV: true,
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
