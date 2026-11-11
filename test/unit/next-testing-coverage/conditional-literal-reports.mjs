import { readExpectedCoverageFixture } from './expected-coverage-fixtures.cjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  cpSync,
} from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, profile] = process.argv.slice(2)
const consumer = resolve(consumerArg),
  output = resolve(outputArg)
const load = createRequire(join(consumer, 'package.json'))
if (!process.argv.includes('--source'))
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const row = readExpectedCoverageFixture(
  join(
    dirname(fileURLToPath(import.meta.url)),
    'fixtures/conditional-literal/pristine.json'
  )
).rows.find((r) => r.name === profile)
assert(row, 'Unknown conditional coverage profile')
const fixture = mkdtempSync(join(consumer, '.next-namefilter-excluded-'))
const canonical = (value) => {
  if (typeof value === 'string') return value.replaceAll(fixture, '<fixture>')
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [
        key.replaceAll(fixture, '<fixture>'),
        canonical(value),
      ])
    )
  return value
}
mkdirSync(output, { recursive: true })
try {
  for (const [name, file] of Object.entries(row.sourceFiles)) {
    writeFileSync(join(fixture, name), file.source)
  }
  writeFileSync(join(fixture, 'package.json'), '{"type":"module"}\n')
  writeFileSync(join(fixture, 'vitest.config.mjs'), row.config)
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    MODE_TRACE: join(output, 'trace.jsonl'),
  }
  for (const name of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[name]
  const owner = await runOwnedNode(
    [
      load.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--outputFile=' + join(output, 'cases.json'),
      ...row.flags,
    ],
    { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  cpSync(join(fixture, 'coverage'), join(output, 'coverage'), {
    recursive: true,
  })
  assertOwnedNodeCompleted(
    owner,
    'actual compact conditional reports ' + profile
  )
  assert.equal(owner.status, row.exitCode, owner.stderr)
  const raw = JSON.parse(readFileSync(join(output, 'cases.json')))
  assert.equal(raw.next.version, 1)
  assert.equal(
    raw.next.events.filter((event) => event.type === 'case-start').length,
    row.caseStarts
  )
  assert.equal(raw.success, true)
  assert.equal(raw.numTotalTests, row.caseStatuses.length)
  assert.equal(raw.numPassedTests, row.passedCases)
  assert.equal(raw.numFailedTests, 0)
  assert.deepEqual(
    raw.testResults.flatMap((file) =>
      file.assertionResults.map((test) => test.status)
    ),
    row.caseStatuses
  )
  const authorEvents = readFileSync(join(output, 'trace.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line).event)
  assert.deepEqual(authorEvents, row.authorEvents)
  assert.deepEqual(
    readdirSync(join(output, 'coverage')).sort(),
    Object.keys(row.coverageFiles).sort()
  )
  for (const [name, expected] of Object.entries(row.coverageFiles)) {
    const bytes = readFileSync(join(output, 'coverage', name), 'utf8')
    assert.deepEqual(
      canonical(name.endsWith('.json') ? JSON.parse(bytes) : bytes),
      expected
    )
  }
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        profile,
        actualCaseStarts: row.caseStarts,
        exactCoverageCountersAndLocations: true,
        selectedCasesAndLifecycle: true,
        actualCompactSourceUnchanged: true,
        completeCoverageFiles: true,
        nativeAndPhysicalJoinsHeld: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
