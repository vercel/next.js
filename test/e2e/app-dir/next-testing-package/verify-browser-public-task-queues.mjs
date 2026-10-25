import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  realpathSync,
  symlinkSync,
  copyFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'
const [consumerArg, outputArg, enginesArg = 'chromium,firefox', onlyGroup] =
  process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify-browser-public-task-queues.mjs <consumer> <new-evidence-dir> [chromium,firefox,webkit] [group]'
)
const consumer = realpathSync(consumerArg),
  output = resolve(outputArg),
  corpus = join(
    dirname(fileURLToPath(import.meta.url)),
    'browser-public-task-queues'
  ),
  expected = JSON.parse(readFileSync(join(corpus, 'reference.json'))),
  engines = enginesArg.split(','),
  require = createRequire(join(consumer, 'package.json'))
assert(
  engines.length > 0 &&
    engines.every((engine) =>
      ['chromium', 'firefox', 'webkit'].includes(engine)
    )
)
if (onlyGroup) assert(Object.hasOwn(expected.groups, onlyGroup))
const next = require.resolve('next/dist/bin/next'),
  nextRoot = dirname(require.resolve('next/package.json')),
  hash = (file) =>
    createHash('sha256').update(readFileSync(file)).digest('hex'),
  save = (dir, name, value) =>
    writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + '\n')
for (const name of ['vitest', 'vite', '@vitest/mocker'])
  assert.throws(() => require.resolve(name))
mkdirSync(output)
const facts = [],
  prepared = []
let ownedReadersClosed = true
for (const browser of engines)
  for (const mode of ['development', 'production'])
    for (const [group, proof] of Object.entries(expected.groups)) {
      if (onlyGroup && group !== onlyGroup) continue
      for (const channel of [
        'json',
        ...(expected.normalAndPrivateChannels.includes(group)
          ? ['normal-no-reporter', 'private-completion']
          : []),
      ]) {
        const name = `${browser}-${mode}-${group}-${channel}`,
          evidence = join(output, name),
          fixture = join(consumer, `.next-test-browser-public-${randomUUID()}`)
        mkdirSync(evidence)
        mkdirSync(fixture)
        const source = join(corpus, proof.source)
        assert.equal(hash(source), proof.sha256)
        copyFileSync(source, join(fixture, 'queue.test.mjs'))
        writeFileSync(
          join(fixture, 'package.json'),
          '{"type":"module","private":true}\n'
        )
        symlinkSync(
          join(consumer, 'node_modules'),
          join(fixture, 'node_modules'),
          'dir'
        )
        writeFileSync(
          join(fixture, 'next.config.mjs'),
          'export default ' +
            JSON.stringify({ turbopack: { root: consumer } }) +
            '\n'
        )
        writeFileSync(
          join(fixture, 'next.test.config.json'),
          JSON.stringify({
            maxWorkers: 1,
            projects: [
              {
                name: 'browser-queues',
                environment: 'browser',
                mode,
                browser: {
                  enabled: true,
                  headless: true,
                  instances: [{ browser }],
                },
                include: ['queue.test.mjs'],
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
          channel,
          name,
          evidence,
          fixture,
        })
      }
    }
save(output, 'inputs.json', {
  reference: expected.reference,
  consumer,
  next,
  nativeRuntime: process.version,
  allInputsPreparedBeforeReaders: true,
  profiles: prepared.map(({ proof, ...r }) => r),
})
try {
  for (const r of prepared) {
    const { browser, mode, group, proof, channel, name, evidence, fixture } = r,
      env = {
        ...process.env,
        NODE_ENV: mode,
        NEXT_TELEMETRY_DISABLED: '1',
        FORCE_COLOR: '0',
      },
      report = join(evidence, 'report.raw.json')
    for (const key of [
      'CI',
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[key]
    const args =
      channel === 'private-completion'
        ? [
            join(corpus, 'completion-worker.mjs'),
            nextRoot,
            fixture,
            evidence,
            browser,
            mode,
            'true',
            proof.prefix,
          ]
        : [
            next,
            'test',
            fixture,
            '--run',
            ...(channel === 'json'
              ? ['--reporter=json', '--outputFile=' + report]
              : []),
          ]
    ownedReadersClosed = false
    const owner = await runOwnedNode(args, {
      cwd: fixture,
      env,
      auditDir: join(evidence, 'processes'),
      timeoutMs: 120000,
    })
    save(evidence, 'owner.json', owner)
    writeFileSync(join(evidence, 'stdout.log'), owner.stdout)
    writeFileSync(join(evidence, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, name)
    ownedReadersClosed = true
    const refName = `${browser}-${mode}-${group}.json`,
      refInfo = expected.profiles[refName],
      refFile = join(corpus, refInfo.path)
    assert.equal(hash(refFile), refInfo.sha256)
    const reference = JSON.parse(readFileSync(refFile))
    let actual
    if (channel === 'json') {
      const raw = JSON.parse(readFileSync(report)),
        rows = raw.next.events
          .filter((e) => e.type === 'output')
          .flatMap((e) =>
            e.text
              .split('\n')
              .filter((line) => line.startsWith(proof.prefix))
              .map((line) => JSON.parse(line.slice(proof.prefix.length)))
          ),
        cases = raw.testResults
          .flatMap((f) => f.assertionResults)
          .map((t) => ({
            name: t.fullName,
            status: t.status,
            failureMessages: t.failureMessages,
          }))
      actual = { rows, cases, success: raw.success, exit: owner.status }
      assert.deepEqual(actual, reference)
    } else if (channel === 'normal-no-reporter') {
      actual = {
        rows: owner.stdout
          .split('\n')
          .filter((line) => line.startsWith(proof.prefix))
          .map((line) => JSON.parse(line.slice(proof.prefix.length))),
        exit: owner.status,
      }
      assert.deepEqual(actual.rows, reference.rows)
      assert.equal(owner.status, reference.exit)
    } else {
      actual = JSON.parse(readFileSync(join(evidence, 'actual.json')))
      assert.deepEqual(actual.rows, reference.rows)
      assert.deepEqual(
        actual.cases,
        reference.cases.map(({ name, status }) => ({ name, status }))
      )
      assert.equal(owner.status, reference.exit)
    }
    assert.equal(hash(join(fixture, 'queue.test.mjs')), proof.sha256)
    save(evidence, 'actual.json', actual)
    facts.push({
      browser,
      mode,
      group,
      channel,
      wholeAuthoredRowsMatch: true,
      caseComparison:
        channel === 'json'
          ? 'name/status/failureMessages'
          : channel === 'private-completion'
            ? 'name/status'
            : null,
      statusExitMatch: true,
    })
    save(output, 'checks.json', { facts })
    console.log(JSON.stringify(facts.at(-1)))
  }
} finally {
  assert(ownedReadersClosed, 'Keep fixture inputs until all owned readers join')
  for (const { fixture } of prepared)
    rmSync(fixture, { recursive: true, force: true })
}
save(output, 'verified.json', {
  profiles: facts.length,
  allAuthoredRowsMatch: true,
  allInputsRemovedAfterOwnedReadersJoined: true,
  caseComparisonFields: {
    json: ['name', 'status', 'failureMessages'],
    privateCompletion: ['name', 'status'],
  },
  facts,
})
