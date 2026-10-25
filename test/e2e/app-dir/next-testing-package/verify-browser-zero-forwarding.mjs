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
  'Expected installed consumer, new evidence directory, and optional browser list'
)
const consumer = fs.realpathSync(consumerArg),
  output = path.resolve(outputArg),
  corpus = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'browser-zero-forwarding'
  ),
  expected = JSON.parse(fs.readFileSync(path.join(corpus, 'reference.json'))),
  load = createRequire(path.join(consumer, 'package.json')),
  next = load.resolve('next/dist/bin/next'),
  engines = enginesArg.split(','),
  prepared = [],
  facts = []
assert(
  engines.length > 0 &&
    engines.every((e) => ['chromium', 'firefox'].includes(e))
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
for (const browser of engines)
  for (const mode of ['development', 'production'])
    for (const group of ['genuine', 'internalGuard']) {
      const proof = expected[group],
        fixture = fs.mkdtempSync(
          path.join(consumer, '.next-test-zero-forwarding-')
        ),
        destination = path.join(output, `${browser}-${mode}-${group}`)
      fs.mkdirSync(destination)
      assert.equal(hash(path.join(corpus, proof.source)), proof.sha256)
      fs.copyFileSync(
        path.join(corpus, proof.source),
        path.join(fixture, 'zero.test.mjs')
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
        'export default ' +
          JSON.stringify({ turbopack: { root: consumer } }) +
          '\n'
      )
      fs.writeFileSync(
        path.join(fixture, 'next.test.config.json'),
        JSON.stringify({
          maxWorkers: 1,
          projects: [
            {
              name: 'zero-native-forwarding',
              environment: 'browser',
              mode,
              browser: {
                enabled: true,
                headless: true,
                instances: [{ browser }],
              },
              include: ['zero.test.mjs'],
              testTimeout: 1000,
              hookTimeout: 1000,
              includeTaskLocation: false,
            },
          ],
        }) + '\n'
      )
      prepared.push({
        browser,
        mode,
        group,
        proof,
        fixture,
        destination,
        started: false,
        joined: false,
      })
    }
save(output, 'inputs.json', {
  reference: expected.reference,
  allInputsPreparedBeforeReaders: true,
  sourceHashes: {
    genuine: expected.genuine.sha256,
    internalGuard: expected.internalGuard.sha256,
  },
})
try {
  for (const record of prepared) {
    const { browser, mode, group, proof, fixture, destination } = record,
      report = path.join(destination, 'report.raw.json'),
      env = {
        ...process.env,
        NODE_ENV: mode,
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
    assertOwnedNodeCompleted(owner, `${browser}-${mode}-${group}`)
    record.joined = true
    const raw = JSON.parse(fs.readFileSync(report)),
      actual = {
        rows: raw.next.events
          .filter((e) => e.type === 'output')
          .flatMap((e) =>
            e.text
              .split('\n')
              .filter((l) => l.startsWith(proof.prefix))
              .map((l) => JSON.parse(l.slice(proof.prefix.length)))
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
    save(destination, 'actual.json', actual)
    let reference
    if (group === 'genuine') {
      const info = proof.profiles[`${browser}-${mode}`]
      for (const entry of [
        info.projected,
        info.rawStandardReport,
        info.rawConsole,
      ])
        assert.equal(hash(path.join(corpus, entry.path)), entry.sha256)
      reference = JSON.parse(
        fs.readFileSync(path.join(corpus, info.projected.path))
      )
    } else reference = proof.expected
    assert.deepEqual(actual, reference)
    assert.equal(hash(path.join(fixture, 'zero.test.mjs')), proof.sha256)
    facts.push({
      browser,
      mode,
      group,
      cases: actual.cases.length,
      fullAuthoredRowsMatch: true,
      caseProjectionFields: ['name', 'status', 'failureMessages'],
      statusExitMatch: true,
      allOwnersClosed: true,
    })
    save(output, 'checks.json', { facts })
    console.log(JSON.stringify(facts.at(-1)))
  }
} finally {
  for (const r of prepared)
    if (!r.started || r.joined)
      fs.rmSync(r.fixture, { recursive: true, force: true })
}
save(output, 'verified.json', {
  profiles: facts.length,
  cases: facts.reduce((n, r) => n + r.cases, 0),
  genuineProfiles: facts.filter((r) => r.group === 'genuine').length,
  internalGuardProfiles: facts.filter((r) => r.group === 'internalGuard')
    .length,
  fullAuthoredRowsAndCaseProjectionsMatch: true,
  allOwnersClosed: true,
  wholeStandardReportsRetainedWithoutEqualityClaim: true,
})
