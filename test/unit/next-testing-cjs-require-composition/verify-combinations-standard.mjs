import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const corpus = read(path.join(here, 'reference-combinations-standard.json'))
const [consumerArg, outputArg, kind, variantArg, expectedNative] =
  process.argv.slice(2)
assert(consumerArg && outputArg)
assert(['source', 'installed'].includes(kind))
assert(Object.hasOwn(corpus.variants, variantArg ?? ''))
if (expectedNative !== undefined) assert.match(expectedNative, /^[a-f0-9]{64}$/)
assert.equal(corpus.referenceVersion, '5.0.4')
assert.equal(corpus.mode, 'development')
assert.deepEqual(corpus.reporters, ['default', 'json'])
assert.deepEqual(corpus.bounds, { cli: 120000, test: 5000, hook: 5000 })
assert.deepEqual(corpus.fields, [
  'status',
  'cases',
  'standardReport',
  'rows',
  'events',
  'eventCounts',
])
const engine = process.versions.node.split('.')[0]
const authority = corpus.variants[variantArg]
assert(authority)
const profile = authority.profiles[engine]
assert(profile, 'Requires a measured Node engine')
for (const index of [profile.genuine, profile.historical])
  assert(Number.isInteger(index) && index >= 0 && index < corpus.models.length)
const fixtureDirectory = path.join(here, 'fixtures', authority.fixture)
const authorityGuard = () => {
  for (const [file, hash] of Object.entries(authority.files))
    assert.equal(sha(path.join(fixtureDirectory, file + '.txt')), hash, file)
}
authorityGuard()
const consumer = fs.realpathSync(consumerArg),
  output = path.resolve(outputArg)
assert(!fs.existsSync(output), 'Requires an unused output directory')
const within = (root, file) => file.startsWith(root + path.sep)
const load = createRequire(path.join(consumer, 'package.json'))
const nextManifest = fs.realpathSync(load.resolve('next/package.json'))
const nextRoot = path.dirname(nextManifest),
  nextCLI = fs.realpathSync(load.resolve('next/dist/bin/next'))
assert.equal(read(nextManifest).name, 'next')
assert(within(consumer, nextRoot))
assert(within(nextRoot, nextCLI))
if (kind === 'source')
  assert.equal(nextRoot, fs.realpathSync(path.join(consumer, 'packages/next')))
else {
  assert(
    within(consumer, nextRoot),
    'Installed Next must be physically inside the consumer'
  )
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
}
const swcEntry = fs.realpathSync(load.resolve('next/dist/build/swc'))
assert(within(nextRoot, swcEntry))
const nativeLoad = createRequire(swcEntry)
const triplesFile = fs.realpathSync(
  nativeLoad.resolve('next/dist/compiled/@napi-rs/triples')
)
assert(within(nextRoot, triplesFile))
const { platformArchTriples } = nativeLoad(triplesFile)
const triples = (
  platformArchTriples[process.platform]?.[process.arch] ?? []
).filter(
  (triple) =>
    !(
      process.platform === 'linux' &&
      process.arch === 'x64' &&
      triple.abi === 'gnux32'
    ) && !(process.platform === 'win32' && triple.abi !== 'msvc')
)
assert(triples.length, 'Requires an available Next native target')
let selectedNative
let nativeStrategy
let nativeTriple
for (const strategy of ['workspace-native', 'platform-package']) {
  for (const triple of triples) {
    try {
      selectedNative = nativeLoad.resolve(
        strategy === 'workspace-native'
          ? `@next/swc/native/next-swc.${triple.platformArchABI}.node`
          : `@next/swc-${triple.platformArchABI}`
      )
      nativeStrategy = strategy
      nativeTriple = triple.platformArchABI
      break
    } catch (error) {
      assert.equal(error.code, 'MODULE_NOT_FOUND')
    }
  }
  if (selectedNative) break
}
assert(selectedNative, 'Requires an available native binding')
const native = fs.realpathSync(selectedNative)
assert(native.endsWith('.node'))
if (kind === 'source') {
  assert.equal(nativeStrategy, 'workspace-native')
  assert.equal(
    native,
    fs.realpathSync(
      path.join(
        consumer,
        'packages/next-swc/native',
        `next-swc.${nativeTriple}.node`
      )
    )
  )
}
assert(
  within(consumer, native),
  'Native binding must be physically inside the consumer'
)
const identity = () => {
  const stat = fs.statSync(native)
  assert.equal(stat.nlink, 1, 'Requires an independently writable native file')
  return {
    consumer,
    nextManifest,
    nextRoot,
    nextVersion: read(nextManifest).version,
    nextManifestSHA256: sha(nextManifest),
    nextCLI,
    nextCLISHA256: sha(nextCLI),
    swcEntry,
    swcEntrySHA256: sha(swcEntry),
    nativeStrategy,
    nativeTriple,
    triplesFile,
    triplesSHA256: sha(triplesFile),
    native,
    nativeSHA256: sha(native),
    nativeDevice: stat.dev,
    nativeInode: stat.ino,
    nativeLinks: stat.nlink,
    actualNode: process.version,
    actualExecutable: process.execPath,
  }
}
function observe(report, rows, events, status) {
  const { next, startTime, ...reportFields } = report
  return {
    status,
    cases: report.testResults.flatMap((file) =>
      file.assertionResults.map(({ duration, ...test }) => test)
    ),
    standardReport: {
      ...reportFields,
      testResults: report.testResults.map(
        ({ startTime, endTime, name, assertionResults, ...file }) => ({
          ...file,
          name: path.basename(name),
          assertionResults: assertionResults.map(
            ({ duration, ...test }) => test
          ),
        })
      ),
    },
    rows,
    events,
    eventCounts: Object.fromEntries(
      [...new Set(events.map((event) => event.name))].map((name) => [
        name,
        events.filter((event) => event.name === name).length,
      ])
    ),
  }
}
function compare(actual, expected) {
  for (const field of corpus.fields)
    assert.deepEqual(actual[field], expected[field], field)
}
const before = identity()
if (expectedNative !== undefined)
  assert.equal(before.nativeSHA256, expectedNative)
const supervisor = fileURLToPath(
  new URL(
    '../../e2e/app-dir/next-testing-package/process-supervisor.mjs',
    import.meta.url
  )
)
fs.mkdirSync(output, { recursive: true })
const save = (name, value) =>
  fs.writeFileSync(
    path.join(output, name),
    JSON.stringify(value, null, 2) + '\n'
  )
save('IDENTITY-BEFORE.json', before)
const fixture = fs.mkdtempSync(
  path.join(consumer, '.next-c3-combinations-standard-reporters-')
)
assert.equal(fs.realpathSync(fixture), fixture)
assert(within(consumer, fixture))
let joined = false
try {
  for (const [file, hash] of Object.entries(authority.files)) {
    const source = path.join(fixtureDirectory, file + '.txt')
    assert.equal(sha(source), hash)
    fs.copyFileSync(source, path.join(fixture, file))
    fs.copyFileSync(source, path.join(output, file))
  }
  for (const name of ['events.jsonl', 'rows.jsonl'])
    fs.writeFileSync(path.join(output, name), '')
  const config = {
    projects: [
      {
        name: authority.projectName,
        mode: 'development',
        environment: 'node',
        isolate: true,
        include: ['contract.case.mjs'],
        testTimeout: 5000,
        hookTimeout: 5000,
        includeTaskLocation: false,
      },
    ],
    fileParallelism: false,
    maxWorkers: 1,
  }
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.test.config.json'),
    JSON.stringify(config) + '\n'
  )
  const args = [
    nextCLI,
    'test',
    fixture,
    '--run',
    '--reporter=default',
    '--reporter=json',
    '--outputFile=' + path.join(output, 'report.json'),
  ]
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    FORCE_COLOR: '0',
    NEXT_REQUIRE_EVENTS: path.join(output, 'events.jsonl'),
    NEXT_REQUIRE_ROWS: path.join(output, 'rows.jsonl'),
  }
  for (const key of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    'NEXT_REQUIRE_CALLBACKS',
  ])
    delete env[key]
  save('INPUTS.json', {
    kind,
    variant: variantArg,
    mode: 'development',
    fixture,
    consumer,
    args,
    config,
    bounds: corpus.bounds,
    sourceSHA256: authority.files,
    supervisor,
    supervisorSHA256: sha(supervisor),
    identity: before,
    reporters: ['default', 'json'],
    customReporterRegistered: false,
    originalElevenCallbackGateUnchangedAndOpen: true,
  })
  const owner = await runOwnedNode(args, {
    cwd: fixture,
    env,
    auditDir: path.join(output, 'owners'),
    timeoutMs: 120000,
  })
  save('OWNER.json', owner)
  fs.writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
  const starts = new Map(
    owner.ownedProcesses.map((record) => [record.pid, record.started])
  )
  const physical = spawnSync(
    '/bin/ps',
    ['-p', [...starts.keys()].join(','), '-o', 'pid=,lstart='],
    { encoding: 'utf8', timeout: 1000 }
  )
  assert(
    [0, 1].includes(physical.status),
    'Cannot inspect the exact owned PIDs'
  )
  const live = physical.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.trim().split(/\s+/))
    .filter(
      (parts) => starts.get(Number(parts[0])) === parts.slice(1).join(' ')
    )
  assert.deepEqual(
    live,
    [],
    'Actual recorded C3 combination processes must be absent'
  )
  joined = true
  save('PHYSICAL-CLOSED.json', {
    actualOwnedProcesses: starts.size,
    ownedProcesses: owner.ownedProcesses,
    psStatus: physical.status,
    psStdout: physical.stdout,
    allRecordedActualIdentitiesAbsent: true,
    noAdditionalSignalsSent: true,
  })
  assertOwnedNodeCompleted(
    owner,
    'separate C3 combination development default+JSON semantic probe'
  )
  assert(!fs.existsSync(path.join(fixture, 'reporter.mjs')))
  assert(!fs.existsSync(path.join(output, 'callbacks.jsonl')))
  const lines = (name) =>
    fs
      .readFileSync(path.join(output, name), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  const report = read(path.join(output, 'report.json'))
  const actual = observe(
    report,
    lines('rows.jsonl'),
    lines('events.jsonl'),
    owner.status
  )
  save('MODEL.json', {
    referenceVersion: '5.0.4',
    actualNode: process.version,
    mode: 'development',
    kind,
    variant: authority.variant,
    sourceSHA256: authority.files,
    ...actual,
    allActualProcessesJoined: true,
  })
  save('NEXT-ENVELOPE.json', report.next)
  compare(actual, corpus.models[profile.genuine])
  compare(actual, corpus.models[profile.historical])
  const startsInReport = report.next.events.filter(
    (event) => event.type === 'file-start'
  )
  assert.equal(startsInReport.length, 1)
  assert.equal(startsInReport[0].entry.profile.mode, 'development')
  assert.equal(startsInReport[0].entry.profile.environment, 'node')
  assert.equal(startsInReport[0].entry.profile.runtime, 'nodejs')
  for (const [file, hash] of Object.entries(authority.files))
    assert.equal(sha(path.join(fixture, file)), hash, file)
  authorityGuard()
  assert.deepEqual(identity(), before)
  save('RESULT.json', {
    passed: true,
    variant: authority.variant,
    kind,
    engine,
    actualNodeVersion: process.version,
    mode: 'development',
    reporters: ['default', 'json'],
    customReporterRegistered: false,
    cases: actual.cases.length,
    rows: actual.rows.length,
    events: actual.events.length,
    completeStandardReportExact: true,
    completeCaseMetadataExact: true,
    wholeAuthoredRowExact: true,
    wholeRequireEventsAndCountsExact: true,
    authoredSourceBytesExact: true,
    historicalC3CombinationSixFieldProjectionExact: true,
    actualConsumerNextNativeIdentityHeld: true,
    originalFullReporterGateClaimedGreen: false,
    originalCombinationFullSevenFieldAll192CallbackGateClaimedGreen: false,
    defaultRenderedTextParityClaimed: false,
    allActualOwnersJoined: true,
  })
} finally {
  try {
    save('IDENTITY-AFTER.json', identity())
    assert.deepEqual(identity(), before)
    authorityGuard()
  } finally {
    if (joined) fs.rmSync(fixture, { recursive: true, force: true })
    save('CLOSED.json', {
      allActualProcessesJoined: joined,
      fixtureRetired: !fs.existsSync(fixture),
    })
  }
}
