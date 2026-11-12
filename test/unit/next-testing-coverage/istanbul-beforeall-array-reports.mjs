import { readCoverageFixture } from './coverage-fixtures.cjs'
import { assertSnapshotReport } from './snapshot-coverage-assertions.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
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
const source = process.argv.includes('--source')
const load = createRequire(join(consumer, 'package.json'))
if (!source)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const pristine = readCoverageFixture(
  join(
    dirname(fileURLToPath(import.meta.url)),
    'fixtures/istanbul-provider/beforeall-array-pristine.json'
  )
)
const row = pristine.rows.find((r) => r.name === profile)
assert(row, 'Missing genuine passed-file profile')
const fixture = mkdtempSync(join(consumer, '.next-readonly-passing-public-'))
const normalizeCoverageMap = (map) =>
  Object.fromEntries(
    Object.entries(map).map(([name, data]) => [
      name.replaceAll(fixture, '<fixture>'),
      { ...data, path: data.path.replaceAll(fixture, '<fixture>') },
    ])
  )
const projectError = (error) => ({
  ...(Object.hasOwn(error, 'name') ? { name: error.name } : {}),
  ...(Object.hasOwn(error, 'message') ? { message: error.message } : {}),
})
mkdirSync(output, { recursive: true })
try {
  for (const [name, bytes] of Object.entries(row.sourceFiles))
    writeFileSync(join(fixture, name), bytes)
  writeFileSync(join(fixture, 'package.json'), '{"type":"module"}\n')
  writeFileSync(join(fixture, 'vitest.config.mjs'), row.config)
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  mkdirSync(join(fixture, '__snapshots__'))
  for (const [name, bytes] of Object.entries(row.snapshots))
    writeFileSync(join(fixture, '__snapshots__', name), bytes)
  const reporter = join(output, 'trace-reporter.mjs')
  writeFileSync(
    reporter,
    `import fs from 'node:fs'
const observed={lifecycle:[],rootErrors:[],runErrors:[]}
const error=e=>({...('name' in e?{name:e.name}:{}),...('message' in e?{message:e.message}:{})})
export default class Reporter {
 onTestModuleEnd(module){observed.lifecycle.push(['module-end',module.state()]);observed.rootErrors=module.errors().map(error)}
 onTestRunEnd(_modules,errors,reason){observed.lifecycle.push(['run-end',reason]);observed.runErrors=errors.map(error);fs.writeFileSync(${JSON.stringify(join(output, 'LIFECYCLE.json'))},JSON.stringify(observed))}
}
`
  )
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: 'development',
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
      '--reporter=' + reporter,
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
  if (existsSync(join(fixture, 'coverage')))
    cpSync(join(fixture, 'coverage'), join(output, 'coverage'), {
      recursive: true,
    })
  const snapshots = Object.fromEntries(
    readdirSync(join(fixture, '__snapshots__')).map((name) => [
      name,
      readFileSync(join(fixture, '__snapshots__', name), 'utf8'),
    ])
  )
  writeFileSync(
    join(output, 'SNAPSHOT-BYTES.json'),
    JSON.stringify(snapshots, null, 2) + '\n'
  )
  assertOwnedNodeCompleted(
    owner,
    'actual readonly passed-file public ' + profile
  )
  assert.equal(owner.status, row.exitCode, owner.stderr)
  const actual = JSON.parse(readFileSync(join(output, 'cases.json')))
  assert.equal(actual.next.version, 1)
  const roots = actual.next.events.filter(
    (event) => event.type === 'suite-end' && event.suiteId === event.entryId
  )
  assert.equal(roots.length, 1)
  assert(!actual.next.events.some((event) => event.type === 'case-start'))
  assert(
    actual.testResults.every((file) =>
      file.assertionResults.every((test) => test.status === 'skipped')
    )
  )
  assert.deepEqual(roots[0].errors.map(projectError), row.rootErrors)
  assertSnapshotReport(actual, row.expected)
  assert.equal(actual.numTotalTests, row.expected.cases.length)
  assert.equal(actual.numTodoTests, row.expected.todo)
  assert.equal(actual.success, row.exitCode === 0)
  assert.deepEqual(
    actual.testResults.map((file) => file.status),
    row.expected.fileStates
  )
  assert.deepEqual(normalizeCoverageMap(actual.coverageMap), row.coverageMap)
  const lifecycle = JSON.parse(readFileSync(join(output, 'LIFECYCLE.json')))
  assert.deepEqual(lifecycle.lifecycle, row.lifecycle)
  assert.deepEqual(lifecycle.rootErrors, row.rootErrors)
  assert.deepEqual(lifecycle.runErrors, [])
  assert.deepEqual(snapshots, row.snapshots)
  if (row.reportOnFailure) {
    assert.deepEqual(readdirSync(join(output, 'coverage')).sort(), [
      'coverage-final.json',
      'coverage-summary.json',
      'lcov.info',
    ])
    const coverage = JSON.parse(
      readFileSync(join(output, 'coverage/coverage-final.json'))
    )
    assert.deepEqual(normalizeCoverageMap(coverage), row.coverageMap)
  } else assert.equal(existsSync(join(output, 'coverage')), false)
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        profile,
        actualBeforeAllArray: true,
        actualOrderedRootErrors: true,
        lifecycleOrder: true,
        caseOutcomesAndSnapshotSummary: true,
        exactCoverageMaps: true,
        reportOnFailure: row.reportOnFailure,
        snapshotBytesUnchanged: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
