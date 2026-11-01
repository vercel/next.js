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
      'fixtures/custom-generated-pristine.json'
    )
  )
).rows.find((row) => row.name === name)
assert(row, 'Missing genuine custom generated-result model')
fs.mkdirSync(output, { recursive: true })
const fixture = fs.mkdtempSync(join(consumer, '.next-custom-generated-')),
  sha = (s) => createHash('sha256').update(s).digest('hex'),
  render = (s) => s.replaceAll('<OUTPUT_DIR>', output)
const canonical = (v) =>
  typeof v === 'string'
    ? v.replaceAll(fixture, '<fixture>').replaceAll(output, '<output>')
    : Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v).map(([k, v]) => [
              k.replaceAll(fixture, '<fixture>'),
              canonical(v),
            ])
          )
        : v
const observe = (file) =>
  new Promise((resolve, reject) => {
    const done = (e) => {
      fs.unwatchFile(file, check)
      clearTimeout(timer)
      e ? reject(e) : resolve()
    }
    const check = () => {
      if (fs.existsSync(file)) done()
    }
    const timer = setTimeout(
      () => done(new Error('Actual JSON did not publish while callback held')),
      30000
    )
    fs.watchFile(file, { interval: 10 }, check)
    check()
  })
const observations = [],
  started = process.hrtime.bigint()
const record = (phase) => {
  const traceFile = join(fixture, 'provider-trace.jsonl')
  observations.push({
    phase,
    elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
    jsonExists: fs.existsSync(join(fixture, 'cases.json')),
    trace: fs.existsSync(traceFile) ? fs.readFileSync(traceFile, 'utf8') : null,
  })
  fs.writeFileSync(
    join(output, 'ACTUAL-STAGES.json'),
    JSON.stringify(observations, null, 2) + '\n'
  )
}
const traceFile = join(fixture, 'provider-trace.jsonl')
const traceChange = () => record('actual-trace-change')
let pending,
  joined = false
try {
  for (const [file, value] of Object.entries(row.sourceFiles)) {
    assert.equal(sha(value.source), value.sha256)
    fs.writeFileSync(join(fixture, file), render(value.source))
  }
  fs.writeFileSync(join(fixture, 'vitest.config.mjs'), row.config)
  fs.writeFileSync(join(fixture, 'package.json'), '{"type":"module"}\n')
  fs.writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.mkdirSync(join(fixture, '__snapshots__'))
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
  const args = [
    load.resolve('next/dist/bin/next'),
    'test',
    fixture,
    '--run',
    ...row.reporters.map(
      (value) =>
        '--reporter=' + (value.endsWith('.mjs') ? join(fixture, value) : value)
    ),
    ...(row.standardReport === null
      ? []
      : ['--outputFile=' + join(fixture, 'cases.json')]),
  ]
  record('before-launch')
  if (row.heldFirstReporter)
    fs.watchFile(traceFile, { interval: 10 }, traceChange)
  pending = runOwnedNode(args, {
    cwd: fixture,
    env,
    auditDir: join(output, 'owners'),
    timeoutMs: 120000,
  })
  if (row.heldFirstReporter) {
    try {
      await observe(join(fixture, 'cases.json'))
    } catch (error) {
      record('json-deadline')
      throw error
    }
    record('json-observed')
    const before = fs
      .readFileSync(join(fixture, 'provider-trace.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((value) => JSON.parse(value))
    fs.writeFileSync(
      join(output, 'ACTUAL-BEFORE-RELEASE.json'),
      JSON.stringify(before, null, 2) + '\n'
    )
    assert(
      before.some((value) => value.name === 'first-enter') &&
        before.some((value) => value.name === 'second-enter')
    )
    assert(!before.some((value) => value.name === 'report'))
    fs.writeFileSync(
      join(output, 'release'),
      'release actual held callback after JSON'
    )
  }
  const owner = await pending
  fs.writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  fs.writeFileSync(join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'custom generated result ' + name)
  joined = true
  assert.equal(owner.status, row.exitCode, owner.stderr)
  for (const file of [
    ...(row.standardReport === null ? [] : ['cases.json']),
    'provider-trace.jsonl',
    'custom-coverage.json',
  ])
    fs.copyFileSync(join(fixture, file), join(output, file))
  if (row.standardReport === null) {
    assert(!fs.existsSync(join(fixture, 'cases.json')))
  } else {
    const report = canonical(
      JSON.parse(fs.readFileSync(join(output, 'cases.json')))
    )
    assert.equal(report.next.version, 1)
    assert.equal(
      report.next.events.filter((e) => e.type === 'case-start').length,
      row.passedCases
    )
    delete report.next
    delete report.startTime
    for (const file of report.testResults) {
      delete file.startTime
      delete file.endTime
      for (const result of file.assertionResults) delete result.duration
    }
    assert.deepEqual(report, row.standardReport)
  }
  const trace = fs
    .readFileSync(join(output, 'provider-trace.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((value) => JSON.parse(value))
  assert.deepEqual(canonical(trace), row.providerTrace)
  assert.deepEqual(
    canonical(
      JSON.parse(fs.readFileSync(join(output, 'custom-coverage.json')))
    ),
    row.providerReport
  )
  for (const [file, value] of Object.entries(row.sourceFiles))
    assert.equal(
      sha(fs.readFileSync(join(fixture, file))),
      sha(render(value.source))
    )
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
        wholeJSONIncludingOpaqueCoverageMap: row.standardReport !== null,
        providerOwnedNoJSONFunction: row.standardReport === null,
        wholeProviderTraceAndReport: true,
        actualReporterSynchronousPrefixes: row.reporters.some((value) =>
          value.endsWith('.mjs')
        ),
        sourceAndSnapshotsHeld: true,
        allActualProcessesJoined: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  fs.unwatchFile(traceFile, traceChange)
  record('before-final-release')
  fs.writeFileSync(join(output, 'release'), 'final actual release')
  if (pending && !joined) {
    const owner = await pending
    fs.writeFileSync(
      join(output, 'FINAL-OWNER.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    record('failed-gate-owner-joined')
    const retained = join(output, 'failed-fixture')
    fs.mkdirSync(retained, { recursive: true })
    for (const name of fs.readdirSync(fixture))
      if (name !== '.next')
        fs.cpSync(join(fixture, name), join(retained, name), {
          recursive: true,
        })
  }
  if (joined) fs.rmSync(fixture, { recursive: true, force: true })
  fs.writeFileSync(
    join(output, 'CLOSED.json'),
    JSON.stringify({
      physicallyJoined: joined,
      fixtureRetired: !fs.existsSync(fixture),
    }) + '\n'
  )
}
