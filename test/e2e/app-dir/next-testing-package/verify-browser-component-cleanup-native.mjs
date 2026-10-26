import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'
import { projectCleanupReport } from './browser-public-default-cleanup/project.mjs'

const [
  rootArg,
  outputArg,
  enginesArg = 'chromium,firefox',
  profileKind = 'installed',
] = process.argv.slice(2)
assert(rootArg && outputArg, 'Expected package root and fresh evidence output')
assert(['source', 'installed'].includes(profileKind))
const root = fs.realpathSync(rootArg),
  output = path.resolve(outputArg),
  corpus = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'browser-component-cleanup-native'
  )
const manifest = JSON.parse(
    fs.readFileSync(path.join(corpus, 'reference.json'))
  ),
  load = createRequire(path.join(root, 'package.json'))
const next =
  profileKind === 'source'
    ? path.join(root, 'packages/next/dist/bin/next')
    : load.resolve('next/dist/bin/next')
if (profileKind === 'installed')
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const engines = enginesArg.split(','),
  prepared = [],
  facts = []
assert(
  engines.length &&
    new Set(engines).size === engines.length &&
    engines.every((engine) => ['chromium', 'firefox'].includes(engine))
)
const hash = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const save = (dir, name, value) =>
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n')
fs.mkdirSync(output)
for (const profile of manifest.profiles.filter((profile) =>
  engines.includes(profile.browser)
)) {
  const source = path.join(corpus, profile.source),
    golden = path.join(corpus, profile.label)
  assert.equal(hash(source), profile.sourceSHA256)
  assert.equal(
    hash(path.join(golden, 'report.raw.json')),
    profile.rawStandardReportSHA256
  )
  assert.equal(
    hash(path.join(golden, 'trace.raw.jsonl')),
    profile.rawCustomTraceSHA256
  )
  assert.equal(
    hash(path.join(golden, 'expected.json')),
    profile.projectedSHA256
  )
  const fixture = fs.mkdtempSync(
      path.join(root, '.next-test-component-cleanup-native-')
    ),
    destination = path.join(output, profile.label)
  fs.mkdirSync(destination)
  fs.copyFileSync(source, path.join(fixture, 'fixtures.test.mjs'))
  fs.copyFileSync(
    path.join(corpus, 'reporter.mjs'),
    path.join(fixture, 'cleanup-reporter.mjs')
  )
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    '{"type":"module","private":true}\n'
  )
  fs.symlinkSync(
    path.join(root, 'node_modules'),
    path.join(fixture, 'node_modules'),
    'dir'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root } }) + '\n'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.test.config.json'),
    JSON.stringify({
      test: {
        mode: profile.mode,
        maxWorkers: 1,
        include: ['fixtures.test.mjs'],
        environment: 'browser',
        browser: {
          enabled: true,
          headless: true,
          instances: [{ browser: profile.browser }],
        },
        testTimeout: 5000,
        hookTimeout: 5000,
        includeTaskLocation: false,
      },
    }) + '\n'
  )
  prepared.push({
    profile,
    fixture,
    destination,
    started: false,
    joined: false,
  })
}
save(output, 'inputs.json', {
  reference: manifest.reference,
  profileKind,
  root,
  profiles: prepared.map((record) => record.profile),
  allInputsPreparedBeforeReaders: true,
})
try {
  for (const record of prepared) {
    const { profile, fixture, destination } = record,
      reportFile = path.join(destination, 'report.raw.json'),
      traceFile = path.join(destination, 'trace.raw.jsonl')
    const env = {
      ...process.env,
      NODE_ENV: profile.mode,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
      CONCURRENCY_TRACE: traceFile,
    }
    for (const key of [
      'CI',
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[key]
    record.started = true
    const owner = await runOwnedNode(
      [
        next,
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--reporter=' + path.join(fixture, 'cleanup-reporter.mjs'),
        '--outputFile=' + reportFile,
      ],
      {
        cwd: fixture,
        env,
        auditDir: path.join(destination, 'owners'),
        timeoutMs: 120000,
      }
    )
    save(destination, 'owner.json', owner)
    fs.writeFileSync(path.join(destination, 'stdout.log'), owner.stdout)
    fs.writeFileSync(path.join(destination, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, profile.label)
    record.joined = true
    const report = JSON.parse(fs.readFileSync(reportFile)),
      trace = JSON.parse(fs.readFileSync(traceFile + '.complete.json'))
    const actual = projectCleanupReport(report, trace, owner.status),
      expected = JSON.parse(
        fs.readFileSync(path.join(corpus, profile.label, 'expected.json'))
      )
    save(destination, 'actual.json', actual)
    assert.equal(
      hash(path.join(fixture, 'fixtures.test.mjs')),
      profile.sourceSHA256
    )
    assert.deepEqual(actual, expected)
    facts.push({
      label: profile.label,
      browser: profile.browser,
      mode: profile.mode,
      variant: profile.variant,
      cases: actual.cases.length,
      authoredRows: actual.rows.length,
      fullSupportedProjectionExact: true,
      allOwnersClosed: true,
    })
    save(output, 'checks.json', { facts })
    console.log(JSON.stringify(facts.at(-1)))
  }
} finally {
  for (const record of prepared)
    if (!record.started || record.joined)
      fs.rmSync(record.fixture, { recursive: true, force: true })
}
save(output, 'verified.json', {
  profiles: facts.length,
  cases: facts.reduce((count, fact) => count + fact.cases, 0),
  authoredRows: facts.reduce((count, fact) => count + fact.authoredRows, 0),
  fullSupportedProjectionsExact: true,
  actualComponentNativeLifetimeExact: true,
  methodAndErrorGetterNativeEffectsExact: true,
  startedCommandJoinsAfterCallbackReturn: true,
  trustedPhysicalClickSequenceExact: true,
  rawGenuineReportsRetained: true,
  readyIdsTimingAndWholeReportEqualityNotClaimed: true,
  plainPromiseCallbacksOnly: true,
  allOwnersClosed: true,
  allInputsRemovedAfterOwnedReadersJoined: true,
})
