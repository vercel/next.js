import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

const [consumerArgument, outputArgument] = process.argv.slice(2)
assert(consumerArgument && outputArgument, 'consumer and output required')
const consumer = resolve(consumerArgument)
const output = resolve(outputArgument)
const require = createRequire(join(consumer, 'package.json'))
for (const name of ['vitest', 'vite'])
  assert.throws(() => require.resolve(name))
mkdirSync(output)
const source = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/late-streamed-redirect'
)
const expected = JSON.parse(readFileSync(join(source, 'expected.json'), 'utf8'))
const ordinary = JSON.parse(
  readFileSync(join(source, 'ordinary-application.expected.json'), 'utf8')
)
assert.deepEqual(
  expected,
  ordinary.map(({ barrier, ...row }) => row)
)
assert.equal(
  ordinary.filter(
    (row) =>
      row.barrier.held &&
      row.barrier.fallbackBeforeRelease &&
      row.barrier.released &&
      row.barrier.fallbackDigestAbsent
  ).length,
  4
)
const hash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const save = (directory, name, value) =>
  writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + '\n')
const verification = []
for (const mode of ['development', 'production']) {
  const out = join(output, mode)
  mkdirSync(out)
  const fixture = join(
    consumer,
    '.next-test-late-streamed-redirect-' + randomUUID()
  )
  mkdirSync(fixture)
  const sources = {}
  const staged = {}
  function stage(path, prefix = '') {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const name = prefix + entry.name
      if (entry.isDirectory()) stage(join(path, entry.name), name + '/')
      else if (entry.isFile()) {
        const target = name.endsWith('.txt') ? name.slice(0, -4) : name
        sources[name] = hash(join(path, entry.name))
        staged[target] = sources[name]
        mkdirSync(dirname(join(fixture, target)), { recursive: true })
        copyFileSync(join(path, entry.name), join(fixture, target))
      }
    }
  }
  stage(source)
  writeFileSync(
    join(fixture, 'package.json'),
    '{"private":true,"type":"module"}\n'
  )
  writeFileSync(
    join(fixture, 'next.test.config.json'),
    JSON.stringify({
      maxWorkers: 1,
      projects: [
        {
          name: 'late-streamed-redirect',
          environment: 'rsc',
          mode,
          route: '/[tenant]/late-redirect/[...slug]',
          include: ['late-redirect.case.jsx'],
          fileTimeout: 60000,
        },
      ],
    }) + '\n'
  )
  const args = [
    require.resolve('next/dist/bin/next'),
    'test',
    fixture,
    '--run',
    '--reporter=json',
    '--outputFile',
    join(out, 'report.json'),
  ]
  const env = {
    ...process.env,
    NODE_ENV: mode,
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
  }
  for (const key of [
    'CI',
    'NODE_PATH',
    'NODE_OPTIONS',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[key]
  save(out, 'command.json', {
    args,
    fixture,
    mode,
    runtime: process.version,
    sources,
    comparison:
      'Complete buffered final fields; real normal-app first-byte/fallback timing remains separate evidence',
    streamingConsumerQualified: false,
  })
  try {
    const result = await runOwnedNode(args, {
      cwd: fixture,
      env,
      auditDir: join(out, 'processes'),
      timeoutMs: 120000,
    })
    writeFileSync(join(out, 'stdout.log'), result.stdout)
    writeFileSync(join(out, 'stderr.log'), result.stderr)
    assertOwnedNodeCompleted(result, 'buffered late redirect ' + mode)
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'))
    const cases = report.testResults.flatMap((file) =>
      file.assertionResults.map(({ fullName, status, failureMessages }) => ({
        fullName,
        status,
        failureMessages,
      }))
    )
    const rows = report.next.events
      .filter((event) => event.type === 'output')
      .flatMap((event) => event.text.split('\n'))
      .filter((line) => line.startsWith('BUFFERED_LATE_REDIRECT '))
      .map((line) => JSON.parse(line.slice('BUFFERED_LATE_REDIRECT '.length)))
    save(out, 'cases.json', cases)
    save(out, 'rows.json', rows)
    assert.equal(result.status, 0)
    assert.equal(cases.length, 6)
    assert(
      cases.every(
        (test) => test.status === 'passed' && test.failureMessages.length === 0
      )
    )
    assert.deepEqual(rows, expected)
    verification.push({
      mode,
      cases: cases.length,
      completeFinalRows: rows.length,
      actualDelayedComponentBarriers: 4,
      allAfterWorkDrained: true,
      allBarriersClosed: true,
      cleanupFailures: result.cleanupFailures,
      leakedProcesses: result.leakedProcesses,
    })
  } finally {
    for (const [file, digest] of Object.entries(staged))
      assert.equal(
        hash(join(fixture, file)),
        digest,
        'Fixture source changed: ' + file
      )
    save(out, 'source-hold.json', {
      inputs: Object.keys(staged).length,
      allInputHashesHeld: true,
    })
    rmSync(fixture, { recursive: true, force: true })
    save(out, 'closed.json', {
      fixtureRemoved: true,
      ownedProcessesClosed: true,
    })
  }
}
save(output, 'verification.json', {
  profiles: verification,
  completeFinalRows: 12,
  ordinaryApplicationTimingProofRetainedSeparately: true,
  streamingConsumerQualified: false,
  rendererChanges: false,
})
console.log('BUFFERED_LATE_REDIRECT_VERIFIED ' + JSON.stringify(verification))
