import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
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
  here = path.dirname(fileURLToPath(import.meta.url)),
  corpus = path.join(here, 'browser-hook-order'),
  expected = JSON.parse(fs.readFileSync(path.join(corpus, 'reference.json'))),
  load = createRequire(path.join(consumer, 'package.json')),
  nextRoot = path.dirname(load.resolve('next/package.json')),
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
    ...(profile.rawRunCompletion ? [profile.rawRunCompletion] : []),
    ...(profile.rawCaseErrors
      ? [
          profile.rawCaseErrors,
          profile.rawErrorObservationReport,
          profile.rawErrorObservationConsole,
        ]
      : []),
  ])
    assert.equal(hash(path.join(corpus, entry.path)), entry.sha256)
  const fixture = fs.mkdtempSync(path.join(consumer, '.next-test-hook-order-')),
    destination = path.join(output, profile.label)
  fs.mkdirSync(destination)
  fs.copyFileSync(
    path.join(corpus, profile.source.path),
    path.join(fixture, 'hooks.test.mjs')
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
          name: 'browser-hook-order',
          environment: 'browser',
          mode: profile.mode,
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: profile.browser }],
          },
          include: ['hooks.test.mjs'],
          testTimeout: 1000,
          hookTimeout: 1000,
          includeTaskLocation: false,
          sequence: { hooks: profile.order },
          ...(profile.limit === null ? {} : { maxConcurrency: profile.limit }),
        },
      ],
    }) + '\n'
  )
  prepared.push({
    ...profile,
    fixture,
    destination,
    started: false,
    joined: false,
  })
}
save(output, 'inputs.json', {
  reference: expected.reference,
  profiles: prepared.length,
  allInputsPreparedBeforeReaders: true,
  playwright: {
    path: fs.realpathSync(load.resolve('playwright/package.json')),
    version: load('playwright/package.json').version,
  },
})
try {
  const engineResults = await Promise.allSettled(
    engines.map(async (browser) => {
      for (const r of prepared.filter((record) => record.browser === browser)) {
        const report = path.join(r.destination, 'report.raw.json'),
          env = {
            ...process.env,
            NODE_ENV: r.mode,
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
        const args =
          r.suite === 'ordering'
            ? [
                path.join(nextRoot, 'dist/bin/next'),
                'test',
                r.fixture,
                '--run',
                '--reporter=json',
                '--outputFile=' + report,
              ]
            : [
                path.join(corpus, 'resource-worker.mjs'),
                nextRoot,
                r.fixture,
                r.destination,
                r.browser,
                r.mode,
                r.kind,
                r.order,
                String(r.limit),
              ]
        r.started = true
        const owner = await runOwnedNode(args, {
          cwd: r.fixture,
          env,
          auditDir: path.join(r.destination, 'owners'),
          timeoutMs: 120000,
        })
        save(r.destination, 'owner.json', owner)
        fs.writeFileSync(path.join(r.destination, 'stdout.log'), owner.stdout)
        fs.writeFileSync(path.join(r.destination, 'stderr.log'), owner.stderr)
        assertOwnedNodeCompleted(owner, r.label)
        r.joined = true
        const reference = JSON.parse(
          fs.readFileSync(path.join(corpus, r.projected.path))
        )
        let actual
        if (r.suite === 'ordering') {
          const raw = JSON.parse(fs.readFileSync(report))
          actual = {
            rows: raw.next.events
              .filter((e) => e.type === 'output')
              .flatMap((e) =>
                e.text
                  .split('\n')
                  .filter((line) => line.startsWith(r.prefix))
                  .map((line) => JSON.parse(line.slice(r.prefix.length)))
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
          }
          save(r.destination, 'actual.json', actual)
          assert.deepEqual(actual, reference)
        } else {
          assert.equal(owner.status, 0)
          actual = JSON.parse(
            fs.readFileSync(path.join(r.destination, 'actual.json'))
          )
          assert.deepEqual(actual.rows, reference.rows)
          assert.deepEqual(
            actual.cases.map((c) => ({ name: c.name, status: c.status })),
            reference.cases.map((c) => ({ name: c.name, status: c.status }))
          )
          assert.deepEqual(actual.diagnostics, [])
          assert.equal(actual.compilerDisposed, true)
          assert.equal(
            actual.result.status,
            reference.success ? 'passed' : 'failed'
          )
          assert.equal(
            actual.result.moduleExecution?.completion?.kind,
            'fulfilled'
          )
          assert.equal(
            actual.result.moduleExecution?.completion?.resultVersion,
            2
          )
          if (r.kind === 'user-cancel') {
            assert.deepEqual(reference.completion, {
              errors: [],
              reason: 'interrupted',
            })
            assert.equal(reference.exit, 1)
            assert.equal(actual.ready, 1)
            assert.equal(actual.userAborted, true)
            assert.equal(actual.result.closedUserCancellation, true)
            assert(actual.cases.every((c) => c.errors.length === 0))
          } else {
            assert.equal(actual.ready, 0)
            assert.equal(actual.userAborted, false)
            assert.equal(actual.result.closedUserCancellation, undefined)
            assert.equal(actual.cases.length, 1)
            assert.equal(actual.cases[0].errors.length, 1)
            const diagnostic = actual.cases[0].errors[0],
              observation = JSON.parse(
                fs
                  .readFileSync(path.join(corpus, r.rawCaseErrors.path), 'utf8')
                  .trim()
              )
            assert.equal(observation.name, actual.cases[0].name)
            assert.equal(observation.result.state, 'failed')
            assert.equal(observation.result.errors.length, 1)
            assert.equal(diagnostic.name, observation.result.errors[0].name)
            assert.equal(
              diagnostic.message,
              observation.result.errors[0].message
            )
            assert.equal(diagnostic.phase, 'runtime')
            assert.equal(diagnostic.severity, 'error')
            assert(
              diagnostic.frames.some(
                (frame) =>
                  frame.file === path.join(r.fixture, 'hooks.test.mjs') &&
                  frame.line === 7 &&
                  frame.original === true
              )
            )
          }
        }
        assert.equal(
          hash(path.join(r.fixture, 'hooks.test.mjs')),
          r.source.sha256
        )
        facts.push({
          browser: r.browser,
          mode: r.mode,
          kind: r.kind,
          order: r.order,
          limit: r.limit,
          fullAuthoredRowsMatch: true,
          caseProjectionMatch: true,
          diagnosticScope:
            r.suite === 'ordering'
              ? 'complete failureMessages'
              : 'name/message and authored mapped line; raw stacks retained',
          allOwnersClosed: true,
        })
        save(output, 'checks.json', { facts })
        console.log(JSON.stringify(facts.at(-1)))
      }
    })
  )
  const failed = engineResults.find((result) => result.status === 'rejected')
  if (failed) throw failed.reason
} finally {
  for (const r of prepared)
    if (!r.started || r.joined)
      fs.rmSync(r.fixture, { recursive: true, force: true })
}
save(output, 'verified.json', {
  profiles: facts.length,
  orderingProfiles: facts.filter(
    (f) =>
      f.kind === 'async-ordering' ||
      f.kind === 'async-suite-ordering' ||
      f.kind.startsWith('getter-')
  ).length,
  resourceProfiles: facts.filter((f) =>
    ['user-cancel', 'hook-deadline'].includes(f.kind)
  ).length,
  fullAuthoredRowsAndCaseProjectionsMatch: true,
  allOwnersClosed: true,
  allInputsRemovedAfterOwnedReadersJoined: prepared.every(
    (r) => !fs.existsSync(r.fixture)
  ),
})
