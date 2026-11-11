import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  readdirSync,
} from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg, profile] = process.argv.slice(2)
const consumer = resolve(consumerArg)
const output = resolve(outputArg)
const load = createRequire(join(consumer, 'package.json'))
const row = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/istanbul-provider/focused-inactive-pristine.json'
    )
  )
).rows.find((row) => row.name === profile)
assert(row)
const excludedOnly = profile === 'focused-inactive-excluded-only'
mkdirSync(output, { recursive: true })
const fixture = mkdtempSync(join(consumer, '.next-focused-inactive-'))
try {
  for (const [name, source] of Object.entries(row.sourceFiles)) {
    writeFileSync(join(fixture, name), source)
  }
  writeFileSync(join(fixture, 'package.json'), '{"type":"module"}\n')
  writeFileSync(join(fixture, 'vitest.config.mjs'), row.config)
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  mkdirSync(join(fixture, '__snapshots__'))
  const reporter = join(output, 'reporter.mjs')
  writeFileSync(
    reporter,
    `import assert from 'node:assert/strict'
import fs from 'node:fs'
const events = []
const excludedOnly = ${excludedOnly}
const save = () => fs.writeFileSync(${JSON.stringify(join(output, 'events.json'))}, JSON.stringify(events))
function checkDeclarations(module, collected) {
  assert.deepEqual(module.errors(), [])
  const children = [...module.children]
  assert.equal(children.length, excludedOnly ? 2 : 1)
  const [first, outer] = children
  assert.equal(first.name, 'first owned body')
  assert.equal(first.options.mode, 'run')
  assert.deepEqual(first.result().errors ?? [], [])
  assert.equal(first.result().state, collected ? 'pending' : 'passed')
  if (excludedOnly) {
    assert.equal(outer.name, 'outer')
    assert.equal(outer.options.mode, 'skip')
    assert.deepEqual(outer.errors(), [])
    const nested = [...outer.children]
    assert.equal(nested.length, 1)
    assert.equal(nested[0].name, 'second owned body')
    assert.equal(nested[0].options.mode, 'only')
    assert.deepEqual(nested[0].result().errors ?? [], [])
    // This regression requires the collected state. Final pending state for
    // excluded-only declarations remains outside its existing contract.
    if (collected) {
      assert.equal(outer.state(), 'skipped')
      assert.equal(nested[0].result().state, 'pending')
    }
  }
}
export default class {
  onTestModuleCollected(module) {
    assert.equal(module.state(), 'pending')
    checkDeclarations(module, true)
    events.push('collected')
    save()
  }
  onTestModuleEnd(module) {
    assert.equal(module.state(), 'passed')
    checkDeclarations(module, false)
    events.push('module-end')
    save()
  }
  onTestRunEnd(modules, errors, reason) {
    assert.equal(modules.length, 1)
    assert.deepEqual(errors, [])
    assert.equal(reason, 'passed')
    checkDeclarations(modules[0], false)
    events.push('run-end')
    save()
  }
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
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  const owner = await runOwnedNode(
    [
      load.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--reporter=' + reporter,
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
  assertOwnedNodeCompleted(owner, 'inactive focused selection ' + profile)
  assert.equal(owner.status, row.exitCode, owner.stderr)
  const report = JSON.parse(readFileSync(join(output, 'cases.json')))
  assert.equal(report.success, true)
  assert.equal(report.numTotalTests, row.expected.total)
  assert.equal(report.numPassedTests, row.expected.passed)
  assert.equal(report.numFailedTests, row.expected.failed)
  assert.deepEqual(report.snapshot, row.expected.snapshot)
  const cases = report.testResults.flatMap((file) => file.assertionResults)
  assert.deepEqual(
    cases.map((test) => test.fullName),
    row.expected.caseNames
  )
  assert.equal(cases[0].status, 'passed')
  assert.deepEqual(
    cases.map((test) => test.failureMessages),
    cases.map(() => [])
  )
  assert.deepEqual(
    report.testResults.map((file) => file.message ?? ''),
    ['']
  )
  if (!excludedOnly) assert.equal(report.numPendingTests, 0)
  assert.deepEqual(JSON.parse(readFileSync(join(output, 'events.json'))), [
    'collected',
    'module-end',
    'run-end',
  ])
  assert.deepEqual(readdirSync(join(fixture, '__snapshots__')), [])
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        profile,
        collectedNamesStatesAndModes: true,
        focusedCaseOutcomesAndSnapshotCounts: true,
        reporterLifecycleOrder: true,
        noSnapshotsWritten: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
