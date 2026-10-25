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
const [consumerArg, outputArg, enginesArg = 'chromium,firefox'] =
  process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Expected installed consumer and new evidence directory'
)
const consumer = fs.realpathSync(consumerArg),
  output = path.resolve(outputArg),
  corpus = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'browser-lazy-actions'
  ),
  expected = JSON.parse(fs.readFileSync(path.join(corpus, 'reference.json'))),
  load = createRequire(path.join(consumer, 'package.json')),
  next = load.resolve('next/dist/bin/next'),
  engines = enginesArg.split(','),
  prepared = [],
  facts = []
assert(
  engines.length > 0 &&
    engines.every((e) => ['chromium', 'firefox'].includes(e)) &&
    new Set(engines).size === engines.length
)
for (const name of ['vitest', 'vite', '@vitest/mocker'])
  assert.throws(() => load.resolve(name))
const hash = (file) =>
    createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  save = (dir, name, value) =>
    fs.writeFileSync(
      path.join(dir, name),
      JSON.stringify(value, null, 2) + '\n'
    )
fs.mkdirSync(output)
for (const profile of expected.profiles.filter((p) =>
  engines.includes(p.browser)
)) {
  for (const entry of [
    profile.source,
    profile.projected,
    profile.rawStandardReport,
    profile.rawConsole,
    ...(profile.rawCaseErrors ? [profile.rawCaseErrors] : []),
  ])
    assert.equal(hash(path.join(corpus, entry.path)), entry.sha256)
  const fixture = fs.mkdtempSync(
      path.join(consumer, '.next-test-lazy-actions-')
    ),
    destination = path.join(output, profile.label)
  fs.mkdirSync(destination)
  fs.copyFileSync(
    path.join(corpus, profile.source.path),
    path.join(fixture, 'action.test.mjs')
  )
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    '{"type":"module","private":true}\n'
  )
  fs.symlinkSync(
    path.join(consumer, 'node_modules'),
    path.join(fixture, 'node_modules'),
    'dir'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.test.config.json'),
    JSON.stringify({
      maxWorkers: 1,
      projects: [
        {
          name: 'browser-lazy-actions',
          environment: 'browser',
          mode: profile.mode,
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: profile.browser }],
          },
          include: ['action.test.mjs'],
          testTimeout: 1000,
          hookTimeout: 1000,
          includeTaskLocation: false,
        },
      ],
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
  reference: expected.reference,
  allInputsPreparedBeforeReaders: true,
  profiles: prepared.map((r) => r.profile),
})
try {
  for (const record of prepared) {
    const { profile, fixture, destination } = record,
      report = path.join(destination, 'report.raw.json'),
      env = {
        ...process.env,
        NODE_ENV: profile.mode,
        NEXT_TELEMETRY_DISABLED: '1',
        FORCE_COLOR: '0',
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
        '--outputFile=' + report,
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
    const raw = JSON.parse(fs.readFileSync(report)),
      prefix = 'BROWSER_HOOK_SEQUENCE:',
      actual = {
        rows: raw.next.events
          .filter((e) => e.type === 'output')
          .flatMap((e) =>
            e.text
              .split('\n')
              .filter((l) => l.startsWith(prefix))
              .map((l) => JSON.parse(l.slice(prefix.length)))
          ),
        cases: raw.testResults
          .flatMap((f) => f.assertionResults)
          .map((t) => ({
            name: t.fullName,
            status: t.status,
            failureMessages: t.failureMessages,
          })),
        success: raw.success,
        exit: owner.status,
      },
      reference = JSON.parse(
        fs.readFileSync(path.join(corpus, profile.projected.path))
      )
    save(destination, 'actual.json', actual)
    assert.deepEqual(actual.rows, reference.rows)
    assert.deepEqual(
      actual.cases.map(({ name, status }) => ({ name, status })),
      reference.cases.map(({ name, status }) => ({ name, status }))
    )
    assert.equal(actual.success, reference.success)
    assert.equal(actual.exit, reference.exit)
    if (profile.rawCaseErrors) {
      const originalErrors = fs
          .readFileSync(path.join(corpus, profile.rawCaseErrors.path), 'utf8')
          .trim()
          .split('\n')
          .map((l) => JSON.parse(l)),
        nextErrors = raw.next.events
          .filter((e) => e.type === 'case-end')
          .map((e) => ({
            name: e.name,
            errors: e.errors.map(({ name, message }) => ({ name, message })),
          }))
      assert.deepEqual(
        nextErrors,
        originalErrors.map((e) => ({
          name: e.name,
          errors: (e.result.errors ?? []).map(({ name, message }) => ({
            name,
            message,
          })),
        }))
      )
      save(destination, 'diagnostic-boundary.json', {
        actualErrorNameMessageExact: true,
        originalRawStandardAndErrorsRetained: true,
        wholeFailureMessagesEqualityClaimed: false,
      })
    } else assert.deepEqual(actual, reference)
    assert.equal(
      hash(path.join(fixture, 'action.test.mjs')),
      profile.source.sha256
    )
    facts.push({
      browser: profile.browser,
      mode: profile.mode,
      group: profile.group,
      cases: actual.cases.length,
      authoredRowsExact: true,
      caseNamesStatusesExact: true,
      statusExitExact: true,
      actualErrorNameMessageExact: !!profile.rawCaseErrors,
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
  cases: facts.reduce((n, r) => n + r.cases, 0),
  allAuthoredRowsAndCaseStatesMatch: true,
  actualGuardErrorNamesMessagesMatch: true,
  guardStackPresentationUnqualified: true,
  allOwnersClosed: true,
  allInputsRemovedAfterOwnedReadersJoined: true,
  wholeStandardReportsRetainedWithoutEqualityClaim: true,
})
