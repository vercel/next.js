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
      'fixtures/custom-dispatch-pristine.json'
    )
  )
).rows.find((row) => row.name === name)
assert(row, 'Missing genuine custom dispatch model')
fs.mkdirSync(output, { recursive: true })
const fixture = fs.mkdtempSync(join(consumer, '.next-custom-dispatch116-')),
  sha = (value) => createHash('sha256').update(value).digest('hex')
let joined = false
try {
  for (const [file, value] of Object.entries(row.sourceFiles)) {
    assert.equal(sha(value.source), value.sha256)
    fs.writeFileSync(join(fixture, file), value.source)
  }
  fs.writeFileSync(join(fixture, 'package.json'), '{}\n')
  fs.writeFileSync(join(fixture, 'vitest.config.mjs'), row.config)
  fs.writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.mkdirSync(join(fixture, '__snapshots__'))
  if (row.priorJSONBytes !== null)
    fs.writeFileSync(join(fixture, 'cases.json'), row.priorJSONBytes)
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: 'development',
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
      '--outputFile=' + join(fixture, 'cases.json'),
    ],
    { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  fs.writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  fs.writeFileSync(join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'actual custom dispatch116 ' + name)
  joined = true
  for (const file of [
    'provider-trace.jsonl',
    'cases.json',
    'custom-coverage.json',
  ])
    if (fs.existsSync(join(fixture, file)))
      fs.copyFileSync(join(fixture, file), join(output, file))
  const hasJSON = fs.existsSync(join(output, 'cases.json')),
    bytes = hasJSON
      ? fs.readFileSync(join(output, 'cases.json'), 'utf8')
      : null,
    publication =
      row.priorJSONBytes !== null && bytes === row.priorJSONBytes
        ? 'preserved'
        : hasJSON
          ? 'written'
          : 'none'
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
    hasJSON,
    hasProviderReport: fs.existsSync(join(output, 'custom-coverage.json')),
    publication,
  }
  if (publication === 'written') {
    const report = JSON.parse(bytes)
    assert.equal(report.next.version, 1)
    actual.caseCounts = {
      passed: report.numPassedTests,
      failed: report.numFailedTests,
    }
    actual.actualJSONCoverageMap = report.coverageMap
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
        actualSynchronousThrowStopsLaterCustomDispatch: true,
        pendingPriorAsyncCloseOwnershipRemainsRequired: true,
        completeProviderTraceAndCustomMap: true,
        authoredErrorsRawUnmodified: true,
        fullAuthoredErrorStackParityQualified: false,
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
