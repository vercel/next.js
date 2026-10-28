import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
const [consumerArg, outputArg, profile] = process.argv.slice(2),
  consumer = resolve(consumerArg),
  output = resolve(outputArg),
  load = createRequire(join(consumer, 'package.json'))
if (!process.argv.includes('--source'))
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const row = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/istanbul-provider/readonly-focused-pristine.json'
    )
  )
).rows.find((r) => r.name === profile)
assert(row, 'Missing genuine focused selection profile')
const fixture = mkdtempSync(join(consumer, '.next-focused-snapshot-')),
  canonical = (value) => {
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
  },
  errorProjection = (value) => {
    if (Array.isArray(value)) return value.map(errorProjection)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => key !== 'stack')
          .map(([key, value]) => [key, errorProjection(value)])
      )
    return value
  }
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
const rows=[];const error=e=>({name:e.name,message:e.message,stack:e.stack});const tree=t=>({type:t.type,name:t.type==='module'?'suite.test.mjs':t.name,state:t.type==='test'?t.result().state:t.state(),...(t.type==='module'?{}:{mode:t.options.mode}),errors:t.type==='test'?(t.result().errors??[]).map(error):t.errors().map(error),...(t.type==='test'?{}:{children:[...t.children].map(tree)})});export default class Reporter{onTestModuleEnd(m){rows.push({event:'module-end',tree:tree(m)})}onTestRunEnd(modules,errors,reason){rows.push({event:'run-end',reason,errors:errors.map(error),modules:modules.map(tree)});fs.writeFileSync(${JSON.stringify(join(output, 'RAW-MODULES.json'))},JSON.stringify(rows,null,2))}}
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
  assertOwnedNodeCompleted(owner, 'actual focused readonly ' + profile)
  assert.equal(owner.status, row.exitCode, owner.stderr)
  const raw = JSON.parse(readFileSync(join(output, 'cases.json')))
  assert.equal(raw.next.version, 1)
  assert.equal(
    raw.next.events.filter((e) => e.type === 'case-start').length,
    row.caseStarts
  )
  const report = canonical(raw)
  delete report.next
  delete report.startTime
  for (const file of report.testResults) {
    delete file.startTime
    delete file.endTime
    for (const test of file.assertionResults) delete test.duration
  }
  assert.deepEqual(report, row.standardReport)
  const modules = canonical(
    JSON.parse(readFileSync(join(output, 'RAW-MODULES.json')))
  )
  assert.deepEqual(errorProjection(modules), errorProjection(row.moduleTrace))
  assert.deepEqual(snapshots, row.snapshots)
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
        completeStandardReportAndMap: true,
        wholeModuleTreeModesStatesErrorNamesMessagesOrder: true,
        rawModuleStacksRetained: true,
        rawModuleStackParityQualified: false,
        completeCoverageFiles: true,
        snapshotBytesUnchanged: true,
        physicalJoinsHeld: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
