import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
} from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [mode, output, installedConsumer] = process.argv.slice(2)
assert(['development', 'production'].includes(mode))
const local = dirname(fileURLToPath(import.meta.url))
const consumer = installedConsumer ?? resolve(local, '../../..')
const require = createRequire(join(consumer, 'package.json'))
if (installedConsumer)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => require.resolve(name), { code: 'MODULE_NOT_FOUND' })
assert(!existsSync(output))
mkdirSync(output, { recursive: true })
const sha = (value) => createHash('sha256').update(value).digest('hex')
let cases = 0
for (const profile of [
  'getter-changing',
  'getter-throw-second',
  'getter-undefined-second',
]) {
  const authored = JSON.parse(
    readFileSync(join(local, 'fixtures/project-fake-timers', profile + '.json'))
  )
  const expected = authored.genuine[mode]
  const out = join(output, profile)
  const fixture = join(consumer, '.next-test-project-clock-' + randomUUID())
  mkdirSync(out)
  mkdirSync(fixture)
  const save = (name, value) =>
    writeFileSync(join(out, name), JSON.stringify(value, null, 2) + '\n')
  const trace = join(out, 'trace.jsonl')
  writeFileSync(trace, '')
  assert.equal(sha(authored.configSource), authored.configSHA256)
  const config = authored.configSource.replace(
    'fakeTimers}',
    `fakeTimers,mode:${JSON.stringify(mode)},environment:'node'}`
  )
  assert.notEqual(config, authored.configSource)
  writeFileSync(join(fixture, 'vitest.config.mjs'), config)
  for (const [name, body] of Object.entries(authored.bodies)) {
    assert.equal(sha(body), authored.bodySHA256[name])
    writeFileSync(join(fixture, name), body)
  }
  save('AUTHORED.json', {
    original: authored,
    actualConfig: config,
    infrastructureDelta:
      'Node mode/environment only; clock bodies and bounds held',
    bounds: { cli: 120000, test: 5000, hook: 5000 },
  })
  const pins = Object.fromEntries(
    [
      'next/dist/experimental/testing/config-worker',
      'next/dist/experimental/testing/config-fake-timers',
      'next/dist/experimental/testing/assertions/fake-timers-core',
    ].map((name) => {
      const file = require.resolve(name)
      return [file, sha(readFileSync(file))]
    })
  )
  save('PINS-BEFORE.json', pins)
  let result
  try {
    result = await runOwnedNode(
      [
        require.resolve('next/dist/bin/next'),
        'test',
        fixture,
        '--reporter=json',
        '--outputFile=' + join(out, 'cases.json'),
      ],
      {
        cwd: consumer,
        env: {
          ...process.env,
          NODE_ENV: mode,
          NEXT_TELEMETRY_DISABLED: '1',
          DATE_NOW_TRACE: trace,
        },
        timeoutMs: 120000,
        auditDir: join(out, 'owners'),
      }
    )
    save('RESULT.json', result)
    writeFileSync(join(out, 'stdout.log'), result.stdout)
    writeFileSync(join(out, 'stderr.log'), result.stderr)
    assertOwnedNodeCompleted(result, 'actual project clock ' + profile)
    assert.equal(result.status, expected.status)
    const rows = readFileSync(trace, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    assert.deepEqual(rows, expected.rows, profile)
    const report = existsSync(join(out, 'cases.json'))
      ? JSON.parse(readFileSync(join(out, 'cases.json')))
      : null
    if (expected.report === null) {
      assert.equal(report, null)
      assert.match(result.stderr, /second now read failed/)
    } else {
      assert.deepEqual(
        Object.fromEntries(
          Object.keys(expected.report).map((key) => [key, report[key]])
        ),
        expected.report
      )
      const actualCases = report.testResults.flatMap((file) =>
        file.assertionResults.map((test) =>
          Object.fromEntries(
            Object.keys(expected.cases[0]).map((key) => [key, test[key]])
          )
        )
      )
      assert.deepEqual(actualCases, expected.cases)
      cases += report.numTotalTests
    }
    for (const [file, hash] of Object.entries(pins))
      assert.equal(sha(readFileSync(file)), hash)
    save('OBSERVED.json', {
      mode,
      profile,
      rows,
      status: result.status,
      exact: true,
    })
    save('PINS-AFTER.json', pins)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
    save('CLOSURE.json', {
      fixtureAbsent: !existsSync(fixture),
      physicalOwnerRecorded: !!result,
    })
  }
}
process.stdout.write(
  JSON.stringify({
    profiles: 3,
    cases,
    modes: 1,
    exactGetterAndClockModels: true,
    secondFailureStopsBodies: true,
    explicitUndefinedRetained: true,
    allOwnersJoined: true,
  }) + '\n'
)
