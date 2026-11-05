import {
  assertPassedCoverageCases,
  assertSnapshotCoverage as assertCoverageHits,
} from './snapshot-coverage-assertions.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  existsSync,
  cpSync,
} from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, profile] = process.argv.slice(2),
  consumer = resolve(consumerArg),
  output = resolve(outputArg),
  load = createRequire(join(consumer, 'package.json'))
assert(consumerArg && outputArg && profile)
if (!process.argv.includes('--source'))
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const row = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      process.argv.includes('--poison')
        ? 'fixtures/istanbul-provider/production-js-poison-pristine.json'
        : 'fixtures/istanbul-provider/production-js-pristine.json'
    )
  )
).rows.find((row) => row.name === profile)
assert(row, 'Missing genuine production profile')
mkdirSync(output, { recursive: true })
const fixture = mkdtempSync(join(consumer, '.next-istanbul-production-js-'))
let joined = false
try {
  for (const [name, source] of Object.entries(row.sourceFiles))
    writeFileSync(join(fixture, name), source)
  writeFileSync(join(fixture, 'package.json'), '{"type":"module"}\n')
  writeFileSync(join(fixture, 'vitest.config.mjs'), row.config)
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  mkdirSync(join(fixture, '__snapshots__'))
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
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
    ],
    { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(
    owner,
    'actual production Istanbul subject ' + profile
  )
  joined = true
  if (existsSync(join(fixture, 'coverage')))
    cpSync(join(fixture, 'coverage'), join(output, 'coverage'), {
      recursive: true,
    })
  assert.equal(owner.status, 0, owner.stderr)
  const report = JSON.parse(readFileSync(join(output, 'cases.json')))
  assertPassedCoverageCases(report, row.caseNames)
  assertCoverageHits(join(output, 'coverage'), fixture, row.coverageHits)
  assert.deepEqual(readdirSync(join(fixture, '__snapshots__')), [])
  assert.equal(
    readFileSync(join(fixture, 'lifecycle.log'), 'utf8'),
    row.lifecycle
  )
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        profile,
        entryExtension: row.entryExtension,
        subjectExtension: row.subjectExtension,
        passedCases: row.caseNames.length,
        focusedCaseOutcomesAndHits: true,
        selectedCoverageFiles: Object.keys(row.coverageHits),
        mode: 'production',
        exactAuthoredLifecycle: true,
        entryExcludedFromCoverageDenominator: true,
        actualPhysicalJoins: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  if (joined) rmSync(fixture, { recursive: true, force: true })
  writeFileSync(
    join(output, 'CLOSED.json'),
    JSON.stringify({
      physicallyJoined: joined,
      fixtureRetired: !existsSync(fixture),
    }) + '\n'
  )
}
