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
      'fixtures/istanbul-provider/typed-source-pristine.json'
    )
  )
).rows.find((row) => row.name === profile)
assert(row, 'Missing genuine typed-source profile')
mkdirSync(output, { recursive: true })
const fixture = mkdtempSync(join(consumer, '.next-istanbul-typed-source-')),
  hash = (value) => createHash('sha256').update(value).digest('hex')
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
let joined = false
try {
  for (const [name, file] of Object.entries(row.sourceFiles)) {
    assert.equal(hash(file.source), file.sha256)
    writeFileSync(join(fixture, name), file.source)
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
    `import fs from 'node:fs';const rows=[];const error=e=>({name:e.name,message:e.message,stack:e.stack});const tree=t=>({type:t.type,name:t.type==='module'?${JSON.stringify(row.specFile)}:t.name,state:t.type==='test'?t.result().state:t.state(),...(t.type==='module'?{}:{mode:t.options.mode}),errors:t.type==='test'?(t.result().errors??[]).map(error):t.errors().map(error),...(t.type==='test'?{}:{children:[...t.children].map(tree)})});const save=()=>fs.writeFileSync(${JSON.stringify(join(output, 'modules.json'))},JSON.stringify(rows,null,2));export default class{onTestModuleEnd(m){rows.push({event:'module-end',tree:tree(m)});save()}onTestRunEnd(modules,errors,reason){rows.push({event:'run-end',reason,errors:errors.map(error),modules:modules.map(tree)});save()}}`
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
    ],
    { cwd: fixture, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'actual Istanbul typed subject ' + profile)
  joined = true
  if (existsSync(join(fixture, 'coverage')))
    cpSync(join(fixture, 'coverage'), join(output, 'coverage'), {
      recursive: true,
    })
  writeFileSync(
    join(output, 'AUTHORED.json'),
    JSON.stringify(
      {
        fixture,
        sourceFiles: Object.fromEntries(
          Object.entries(row.sourceFiles).map(([name, file]) => [
            name,
            { ...file, actualSha256: hash(readFileSync(join(fixture, name))) },
          ])
        ),
        config: readFileSync(join(fixture, 'vitest.config.mjs'), 'utf8'),
      },
      null,
      2
    ) + '\n'
  )
  assert.equal(owner.status, row.exitCode, owner.stderr)
  const raw = JSON.parse(readFileSync(join(output, 'cases.json'))),
    report = canonical(raw)
  assert.equal(raw.next.version, 1)
  assert.equal(
    raw.next.events.filter((event) => event.type === 'case-start').length,
    row.passedCases
  )
  delete report.next
  delete report.startTime
  for (const file of report.testResults) {
    delete file.startTime
    delete file.endTime
    for (const test of file.assertionResults) delete test.duration
  }
  assert.deepEqual(report, row.standardReport)
  assert.deepEqual(
    canonical(JSON.parse(readFileSync(join(output, 'modules.json')))),
    row.moduleTrace
  )
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
  const snapshots = Object.fromEntries(
    readdirSync(join(fixture, '__snapshots__')).map((name) => [
      name,
      readFileSync(join(fixture, '__snapshots__', name), 'utf8'),
    ])
  )
  assert.deepEqual(snapshots, row.snapshots)
  for (const [name, file] of Object.entries(row.sourceFiles))
    assert.equal(hash(readFileSync(join(fixture, name))), file.sha256)
  assert.equal(
    readFileSync(join(fixture, 'vitest.config.mjs'), 'utf8'),
    row.config
  )
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        profile,
        entryExtension: row.entryExtension,
        subjectExtension: row.subjectExtension,
        passedCases: row.passedCases,
        completeStandardJSONAndModuleEndRunEnd: true,
        actualCompletionCallbacks: 2,
        activeCoverageCollectedSupport: false,
        completeJSONSummaryLCOV: true,
        selectedTypedSubjectCoverage: true,
        entryExcludedFromCoverageDenominator: true,
        authoredBytesUnchanged: true,
        actualPhysicalJoins: true,
        snapshotsUnchanged: true,
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
