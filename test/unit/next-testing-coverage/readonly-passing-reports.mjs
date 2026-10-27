import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
const pristine = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/istanbul-provider/readonly-passing-pristine.json'
    )
  )
)
const row = pristine.rows.find((r) => r.name === profile)
assert(row, 'Missing genuine passed-file profile')
const fixture = mkdtempSync(join(consumer, '.next-readonly-passing-public-'))
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
const stableReport = (raw) => {
  const report = canonical(raw)
  // This existing Next-only event extension is retained in raw cases.json and
  // checked separately; every standard reference field remains in this comparison.
  delete report.next
  delete report.startTime
  for (const file of report.testResults) {
    delete file.startTime
    delete file.endTime
    for (const test of file.assertionResults) delete test.duration
  }
  return report
}
const stableModule = (module) => ({
  state: module.state,
  tests: module.tests,
  errors: module.errors.map(({ name, message }) => ({ name, message })),
})
mkdirSync(output, { recursive: true })
try {
  for (const [name, file] of Object.entries(row.sourceFiles)) {
    assert.equal(
      createHash('sha256').update(file.source).digest('hex'),
      file.sha256
    )
    writeFileSync(join(fixture, name), file.source)
  }
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
const rows=[];const error=e=>({name:e.name,message:e.message,stack:e.stack});const module=m=>({state:m.state(),errors:m.errors().map(error),tests:Array.from(m.children.allTests()).map(t=>({name:t.name,state:t.result().state,errors:(t.result().errors||[]).map(error)}))});export default class Reporter{onTestModuleEnd(m){rows.push({event:'module-end',...module(m)})}onTestRunEnd(modules,errors,reason){rows.push({event:'run-end',reason,errors:errors.map(error),modules:modules.map(module)});fs.writeFileSync(${JSON.stringify(join(output, 'RAW-MODULES.json'))},JSON.stringify(rows,null,2))}}
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
  assert.deepEqual(
    roots[0].errors.map(({ name, message }) => ({ name, message })),
    row.moduleTrace.find((event) => event.event === 'module-end').errors
  )
  assert.deepEqual(stableReport(actual), row.json)
  const rawModules = JSON.parse(readFileSync(join(output, 'RAW-MODULES.json')))
  const modules = rawModules.map((r) =>
    r.event === 'module-end'
      ? { event: r.event, ...stableModule(r) }
      : {
          event: r.event,
          reason: r.reason,
          errors: r.errors.map(({ name, message }) => ({ name, message })),
          modules: r.modules.map(stableModule),
        }
  )
  assert.deepEqual(modules, row.moduleTrace)
  assert.deepEqual(snapshots, row.snapshots)
  if (row.reportOnFailure) {
    assert.deepEqual(
      readdirSync(join(output, 'coverage')).sort(),
      Object.keys(row.coverageFiles).sort()
    )
    for (const [name, expected] of Object.entries(row.coverageFiles)) {
      const file = readFileSync(join(output, 'coverage', name), 'utf8')
      assert.deepEqual(
        name.endsWith('.json') ? canonical(JSON.parse(file)) : canonical(file),
        expected
      )
    }
  } else assert.equal(existsSync(join(output, 'coverage')), false)
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        profile,
        actualOrdinaryPassedCase: true,
        actualOrderedModuleErrors: true,
        actualOrderedRootErrors: true,
        nextExtensionRetainedSeparately: true,
        completeCaseReportAndMap: true,
        completeCoverageFiles: true,
        reportOnFailure: row.reportOnFailure,
        snapshotBytesUnchanged: true,
        rawErrorStacksRetained: true,
        rawFrameEqualityQualified: false,
        publicTaskAccessorQualified: false,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
