import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
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
      'fixtures/threshold-formatter-multiproject-cases.json'
    )
  )
).rows.find((row) => row.name === name)
assert(row, 'Missing root formatter scenario')
fs.mkdirSync(output, { recursive: true })
const fixture = fs.mkdtempSync(
    join(consumer, '.next-root-formatter-projects-')
  ),
  config = row.configTemplate.replaceAll('<OUTPUT_DIR>', output)
const canonical = (value) =>
  value.replaceAll(fixture, '<fixture>').replaceAll(output, '<output>')
let joined = false
try {
  for (const [file, value] of Object.entries(row.sourceFiles)) {
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
  const raw = JSON.parse(fs.readFileSync(join(output, 'cases.json')))
  assert.equal(raw.next.version, 1)
  assert.equal(
    raw.next.events.filter((e) => e.type === 'case-start').length,
    row.passed
  )
  assert.equal(raw.success, true)
  assert.equal(raw.numTotalTests, row.passed)
  assert.equal(raw.numPassedTests, row.passed)
  assert.equal(raw.numFailedTests, 0)
  assert.equal(raw.numPendingTests, 0)
  assert.deepEqual(
    raw.testResults.flatMap((file) =>
      file.assertionResults.map((test) => [test.fullName, test.status])
    ),
    Array.from({ length: row.passed }, () => [
      'each inherited project owns its case',
      'passed',
    ])
  )
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
  const map = JSON.parse(
    fs.readFileSync(join(output, 'coverage/coverage-final.json'))
  )
  const expectedFiles = [
    'subject.mjs',
    ...('unimported.mjs' in row.sourceFiles ? ['unimported.mjs'] : []),
  ]
  assert.deepEqual(
    Object.keys(map)
      .map((file) => basename(file))
      .sort(),
    [...expectedFiles].sort()
  )
  for (const file of expectedFiles) {
    const coverage = Object.entries(map).find(
      ([name]) => basename(name) === file
    )[1]
    const hits = file === 'subject.mjs' ? row.projects : 0
    assert.deepEqual(Object.values(coverage.f), [hits, 0])
    assert.deepEqual(Object.values(coverage.s), [hits, hits, 0, 0])
    assert.deepEqual(Object.values(coverage.b), [[hits, 0]])
  }
  const totals = JSON.parse(
    fs.readFileSync(join(output, 'coverage/coverage-summary.json'))
  ).total
  assert.equal(totals.lines.total, expectedFiles.length * 3)
  assert.equal(totals.lines.covered, 1)
  assert.equal(totals.functions.total, expectedFiles.length * 2)
  assert.equal(totals.functions.covered, 1)
  assert.equal(totals.statements.total, expectedFiles.length * 4)
  assert.equal(totals.statements.covered, 2)
  assert.equal(totals.branches.total, expectedFiles.length * 2)
  assert.equal(totals.branches.covered, 1)
  const lcov = fs.readFileSync(join(output, 'coverage/lcov.info'), 'utf8')
  assert(lcov.includes(`FNDA:${row.projects},choose`))
  assert(lcov.includes('FNDA:0,unused'))
  for (const [file, value] of Object.entries(row.sourceFiles))
    assert.equal(fs.readFileSync(join(fixture, file), 'utf8'), value.source)
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
        formatterInputsConfigAndMergedCountsEqual: true,
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
