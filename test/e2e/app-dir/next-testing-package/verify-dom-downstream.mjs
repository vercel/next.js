import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, resolve } from 'node:path'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

const [consumerArgument, outputArgument, upstreamArgument] =
  process.argv.slice(2)
assert(
  consumerArgument && outputArgument && upstreamArgument,
  'Usage: node verify-dom-downstream.mjs <physical-consumer> <new-output-dir> <usehooks-ts-checkout>'
)
const consumer = realpathSync(consumerArgument)
const upstream = realpathSync(upstreamArgument)
const output = resolve(outputArgument)
const expected = JSON.parse(
  readFileSync(new URL('./dom-downstream.expected.json', import.meta.url))
)
const sha = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const installed = createRequire(join(consumer, 'package.json'))
const next = installed.resolve('next/dist/bin/next')
assert(realpathSync(next).startsWith(consumer + '/'))
for (const name of ['vitest', 'vite'])
  assert(!existsSync(join(consumer, 'node_modules', name)))
for (const [name, version] of Object.entries(expected.dependencies))
  assert.equal(installed(name + '/package.json').version, version, name)
const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: upstream,
  encoding: 'utf8',
})
assert.equal(revision.status, 0, revision.stderr)
assert.equal(revision.stdout.trim(), expected.revision)
mkdirSync(output)
copyFileSync(join(upstream, 'LICENSE'), join(output, 'usehooks-ts.LICENSE'))
const fixture = mkdtempSync(join(consumer, '.next-test-dom-downstream-'))
const source = join(upstream, 'packages/usehooks-ts')
let completed = false
function assertSources() {
  for (const input of expected.inputs)
    assert.equal(sha(join(fixture, input.path)), input.sha256, input.path)
}
try {
  for (const directory of ['src', 'tests'])
    cpSync(join(source, directory), join(fixture, directory), {
      recursive: true,
    })
  copyFileSync(
    join(source, 'vitest.config.ts'),
    join(fixture, 'vitest.config.ts')
  )
  assertSources()
  writeFileSync(
    join(fixture, 'package.json'),
    JSON.stringify({
      name: 'next-testing-usehooks-dom',
      private: true,
      type: 'module',
    })
  )
  writeFileSync(join(fixture, 'next.config.mjs'), 'export default {}\n')
  writeFileSync(
    join(fixture, 'next.test.config.json'),
    JSON.stringify({
      compatibility: 'vitest',
      maxWorkers: 1,
      projects: [
        {
          name: 'usehooks-jsdom',
          environment: 'jsdom',
          mode: 'development',
          globals: true,
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          setupFiles: ['tests/setup.ts'],
        },
      ],
    })
  )
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
  for (const name of [
    'CI',
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[name]
  const report = join(output, 'report.json')
  const result = await runOwnedNode(
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
      auditDir: join(output, 'processes'),
      timeoutMs: 600000,
    }
  )
  writeFileSync(
    join(output, 'command.result.json'),
    JSON.stringify(result, null, 2)
  )
  writeFileSync(join(output, 'command.stdout'), result.stdout ?? '')
  writeFileSync(join(output, 'command.stderr'), result.stderr ?? '')
  assertOwnedNodeCompleted(result, 'unchanged downstream DOM suites')
  const actual = JSON.parse(readFileSync(report))
  const cases = actual.testResults
    .flatMap((file) =>
      file.assertionResults.map(({ duration: _duration, ...record }) => ({
        file: relative(fixture, file.name),
        ...record,
      }))
    )
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  assertSources()
  assert.equal(result.status, 0)
  assert.equal(actual.success, true)
  assert.equal(actual.numTotalTests, 168)
  assert.equal(actual.numPassedTests, 164)
  assert.equal(actual.numPendingTests, 4)
  assert.equal(actual.numFailedTests, 0)
  assert.equal(actual.testResults.length, 29)
  assert.deepEqual(
    cases,
    expected.cases.toSorted((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b))
    )
  )
  assert.deepEqual(actual.snapshot, expected.snapshot)
  completed = true
  writeFileSync(
    join(output, 'passed.json'),
    JSON.stringify(
      {
        revision: expected.revision,
        sourceFiles: expected.inputs.length,
        files: actual.testResults.length,
        passed: actual.numPassedTests,
        skipped: actual.numPendingTests,
        completeCaseFieldsExceptDuration: true,
        completeSnapshotFields: true,
        unchangedBodies: true,
        noVitestViteRuntime: true,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      null,
      2
    )
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
  writeFileSync(
    join(output, 'fixture-cleanup.json'),
    JSON.stringify({ fixtureRemoved: !existsSync(fixture), completed })
  )
}
console.log(`Unchanged downstream DOM suites passed: ${output}`)
