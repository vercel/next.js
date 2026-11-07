import assert from 'node:assert/strict'
import { assertModuleStartCausalOrder } from './module-start-causal.mjs'
import { createRequire } from 'node:module'
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { join, dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [profile, mode, output, installedConsumer] = process.argv.slice(2),
  local = dirname(fileURLToPath(import.meta.url)),
  consumer = installedConsumer ?? resolve(local, '../../..'),
  require = createRequire(join(consumer, 'package.json'))
assert(['success', 'setup-failure', 'cleanup-failure'].includes(profile))
assert(['development', 'production'].includes(mode))
if (installedConsumer)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => require.resolve(name), { code: 'MODULE_NOT_FOUND' })
const input = join(local, 'fixtures/module-start-public', profile + '.json'),
  authored = JSON.parse(readFileSync(input)),
  expected = { ...authored.genuine.development, ...authored.genuine[mode] },
  out = output + '.public',
  fixture = join(consumer, '.next-test-module-start-' + randomUUID()),
  markers = join(out, 'queued'),
  releases = join(out, 'release'),
  trace = join(out, 'trace.jsonl')
assert(!existsSync(out))
mkdirSync(out, { recursive: true })
mkdirSync(fixture)
mkdirSync(markers)
mkdirSync(releases)
writeFileSync(trace, '')
const sha = (b) => createHash('sha256').update(b).digest('hex'),
  save = (n, v) =>
    writeFileSync(join(out, n), JSON.stringify(v, null, 2) + '\n')
for (const [n, b] of Object.entries(authored.sourceFiles)) {
  assert.equal(sha(Buffer.from(b)), authored.sourceSHA256[n])
  writeFileSync(join(fixture, n), b)
}
writeFileSync(join(fixture, 'reporter.mjs'), authored.reporter)
const config = {
  test: { ...authored.originalTestConfig.test, mode, environment: 'node' },
}
writeFileSync(
  join(fixture, 'vitest.config.mjs'),
  'export default ' + JSON.stringify(config) + '\n'
)
const pins = {}
for (const module of [
  'next/dist/experimental/testing/runner/lifecycle',
  'next/dist/experimental/testing/runner/index',
  'next/dist/experimental/testing/reporting/task-updates',
  'next/dist/experimental/testing/reporting/custom-reporter-worker',
]) {
  const path = require.resolve(module)
  pins[path] = sha(readFileSync(path))
}
const sourceNative = join(
    consumer,
    'packages/next-swc/native/next-swc.darwin-arm64.node'
  ),
  native = existsSync(sourceNative)
    ? sourceNative
    : createRequire(require.resolve('next/dist/build/swc')).resolve(
        '@next/swc-darwin-arm64'
      )
pins[native] = sha(readFileSync(native))
save('AUTHORED.json', {
  input,
  inputSHA256: sha(readFileSync(input)),
  sourceFiles: authored.sourceFiles,
  sourceSHA256: authored.sourceSHA256,
  reporter: authored.reporter,
  config,
  originalTestConfig: authored.originalTestConfig,
  infrastructureDelta:
    'Next mode/environment only; original fixture/reporter bytes and CLI/observation bounds held',
})
save('PINS-BEFORE.json', pins)
const args = [
  require.resolve('next/dist/bin/next'),
  'test',
  fixture,
  '--reporter=./reporter.mjs',
  '--reporter=json',
  '--outputFile=' + join(out, 'cases.json'),
]
const env = {
  ...process.env,
  NODE_ENV: mode,
  CI: '1',
  FORCE_COLOR: '0',
  NEXT_TELEMETRY_DISABLED: '1',
  TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
  QUEUED_TRACE: trace,
  QUEUED_MARKERS: markers,
  QUEUED_RELEASE: releases,
  QUEUED_RUNTIME: join(out, 'ACTUAL-RUNTIME.json'),
}
delete env.NODE_OPTIONS
delete env.NODE_PATH
save('REQUEST.json', {
  args,
  cwd: fixture,
  timeoutMs: 120000,
  observationTimeoutMs: 30000,
  observationPollMs: 10,
  additiveOuterDiscriminator:
    'Release Start only after actual ModuleEnd; same reporter/body, no delay or ack',
  execPath: process.execPath,
  versions: process.versions,
  installedConsumer: installedConsumer ?? null,
})
let completed, failure
const held = [],
  rows = () =>
    readFileSync(trace, 'utf8').split('\n').filter(Boolean).map(JSON.parse)
const running = runOwnedNode(args, {
  cwd: fixture,
  env,
  auditDir: join(out, 'owners'),
  timeoutMs: 120000,
}).then((result) => {
  completed = result
  save('RESULT.json', result)
  writeFileSync(join(out, 'stdout.log'), result.stdout)
  writeFileSync(join(out, 'stderr.log'), result.stderr)
  return result
})
try {
  const deadline = Date.now() + 30000
  let first
  while (Date.now() < deadline) {
    first = readdirSync(markers)
    if (
      first.length &&
      rows().some((row) => row.actor === 'reporter' && row.event === 'end')
    )
      break
    assert(!completed, 'CLI closed before actual held ModuleEnd')
    await delay(10)
  }
  assert(
    first?.length &&
      rows().some((row) => row.actor === 'reporter' && row.event === 'end'),
    'original30000ms actual End observation deadline'
  )
  held.push({ stage: 'end-held', markers: first, rows: rows() })
  for (const file of first) writeFileSync(join(releases, file), 'release')
  const result = await running
  assertOwnedNodeCompleted(result, 'actual ModuleStart ' + profile + ' ' + mode)
  const report = JSON.parse(readFileSync(join(out, 'cases.json'))),
    actual = rows()
  save('OBSERVED.json', {
    profile,
    mode,
    status: result.status,
    rows: actual,
    held,
    wholeStandardReport: report,
    runtime: JSON.parse(readFileSync(join(out, 'ACTUAL-RUNTIME.json'))),
  })
  const owners = new Set(
    actual.filter((row) => 'id' in row).map((row) => row.id)
  )
  assert.equal(owners.size, 1)
  const owner = [...owners][0]
  assert.equal(typeof owner, 'string')
  assert(owner.length)
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          key === 'id' && item === owner
            ? '[actual-owner:a.case.mjs]'
            : canonical(item),
        ])
      )
    return value
  }
  assertModuleStartCausalOrder(canonical(actual), expected.rows, held[0].rows)
  const standardCounts = Object.fromEntries(
    Object.entries(report).filter(
      ([key]) => key.startsWith('num') || key === 'success'
    )
  )
  const standardFileStates = report.testResults.map((file) => ({
    name: basename(file.name),
    status: file.status,
    message: file.message,
    assertions: file.assertionResults.map((test) => ({
      title: test.title,
      fullName: test.fullName,
      ancestorTitles: test.ancestorTitles,
      status: test.status,
    })),
  }))
  assert.deepEqual(standardCounts, expected.standardCounts)
  assert.deepEqual(standardFileStates, expected.standardFileStates)
  assert.equal(result.status, expected.status)
  for (const [n, b] of Object.entries(authored.sourceFiles))
    assert.equal(sha(readFileSync(join(fixture, n))), sha(Buffer.from(b)), n)
  assert.equal(
    sha(readFileSync(join(fixture, 'reporter.mjs'))),
    sha(Buffer.from(authored.reporter)),
    'the original reporter bytes remain held after execution'
  )
  const checks = {
    profile,
    mode,
    status: result.status,
    wholeReporterStreamEqual: true,
    wholeAuthorStreamEqual: true,
    actualEndGatedCausalOrderHeld: true,
    standardCountsStatesAndFileMessagesEqual: true,
    allOriginalBodyAndReporterBytesHeld: true,
    allPhysicalOwnersJoined: true,
    sdkAbsent: !!installedConsumer,
    ownerIdMapping:
      'One consistently observed actual module id to its actual known a.case.mjs owner; every other observer field exact',
    openQualifications: [
      'original immediate-release interleaving',
      'cross-process combined filesystem order is not guaranteed by unawaited dispatch',
      'public module.task facade',
      'whole standard error stack/schema',
      'other profiles and sinks',
    ],
  }
  save('CHECKS.json', checks)
  writeFileSync(output, JSON.stringify(checks, null, 2) + '\n')
} catch (error) {
  failure = error
  save('FAILURE.json', {
    name: error?.name,
    message: error?.message,
    stack: error?.stack,
    held,
  })
} finally {
  writeFileSync(join(releases, 'a.case.mjs'), 'release')
  await running
  for (const [path, hash] of Object.entries(pins))
    assert.equal(sha(readFileSync(path)), hash, path)
  save('PINS-AFTER.json', { allBeforeBytesHeld: true, pins })
  if (
    completed &&
    !completed.timedOut &&
    !completed.leakedProcesses.length &&
    !completed.cleanupFailures.length
  )
    rmSync(fixture, { recursive: true, force: true })
  save('CLOSURE.json', {
    canonicalOwnerReturned: !!completed,
    fixtureRemoved: !existsSync(fixture),
    timedOut: completed?.timedOut,
    cleanupFailures: completed?.cleanupFailures,
    leaks: completed?.leakedProcesses,
  })
}
if (failure) throw failure
