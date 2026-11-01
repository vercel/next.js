import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, name] = process.argv.slice(2),
  consumer = resolve(consumerArg),
  output = resolve(outputArg),
  load = createRequire(join(consumer, 'package.json'))
assert(consumerArg && outputArg && name)
if (!process.argv.includes('--source'))
  for (const module of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(module))
const row = JSON.parse(
  fs.readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/coverage-watermarks-pristine.json'
    )
  )
).rows.find((row) => row.name === name)
assert(row, 'Missing complete genuine coverage watermarks profile')
fs.mkdirSync(output, { recursive: true })
const fixture = fs.mkdtempSync(join(consumer, '.next-coverage-watermarks-')),
  sha = (value) => createHash('sha256').update(value).digest('hex')
const canonical = (value) =>
  typeof value === 'string'
    ? value.replaceAll(fixture, '<fixture>')
    : Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value).map(([key, value]) => [
              key.replaceAll(fixture, '<fixture>'),
              canonical(value),
            ])
          )
        : value
let joined = false
try {
  for (const [file, value] of Object.entries(row.sourceFiles)) {
    assert.equal(sha(value.source), value.sha256)
    fs.mkdirSync(dirname(join(fixture, file)), { recursive: true })
    fs.writeFileSync(join(fixture, file), value.source)
  }
  fs.writeFileSync(join(fixture, 'package.json'), ' {"type":"module"}\n')
  fs.writeFileSync(join(fixture, 'vitest.config.mjs'), row.config)
  fs.writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.mkdirSync(join(fixture, '__snapshots__'))
  const reporter = join(output, 'reporter.mjs')
  fs.writeFileSync(
    reporter,
    `import fs from 'node:fs';const rows=[];const error=e=>({name:e.name,message:e.message,stack:e.stack});const tree=t=>({type:t.type,name:t.type==='module'?'suite.test.mjs':t.name,state:t.type==='test'?t.result().state:t.state(),...(t.type==='module'?{}:{mode:t.options.mode}),errors:t.type==='test'?(t.result().errors??[]).map(error):t.errors().map(error),...(t.type==='test'?{}:{children:[...t.children].map(tree)})});const save=()=>fs.writeFileSync(${JSON.stringify(join(output, 'modules.json'))},JSON.stringify(rows,null,2));export default class{onTestModuleEnd(m){rows.push({event:'module-end',tree:tree(m)});save()}onTestRunEnd(modules,errors,reason){rows.push({event:'run-end',reason,errors:errors.map(error),modules:modules.map(tree)});save()}}`
  )
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: row.mode,
    FORCE_COLOR: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
  }
  for (const key of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[key]
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
  fs.writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  fs.writeFileSync(join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'configured coverage watermarks ' + name)
  joined = true
  if (fs.existsSync(join(fixture, 'coverage')))
    fs.cpSync(join(fixture, 'coverage'), join(output, 'coverage'), {
      recursive: true,
    })
  assert.equal(owner.status, row.exitCode, owner.stderr)
  const raw = JSON.parse(fs.readFileSync(join(output, 'cases.json'))),
    report = canonical(raw)
  assert.equal(raw.next.version, 1)
  assert.equal(
    raw.next.events.filter((e) => e.type === 'case-start').length,
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
  if (row.moduleTrace !== undefined)
    assert.deepEqual(
      canonical(JSON.parse(fs.readFileSync(join(output, 'modules.json')))),
      row.moduleTrace
    )
  const stripANSI = stripVTControlCharacters
  const lines = owner.stdout.split('\n'),
    start = lines.findIndex(
      (line) => /^[-|]+$/.test(stripANSI(line).trim()) && line.includes('|')
    )
  assert(start >= 0, 'Missing actual complete text table')
  const end = lines.findIndex(
    (line, index) =>
      index > start + 2 &&
      /^[-|]+$/.test(stripANSI(line).trim()) &&
      line.includes('|')
  )
  assert(end > start + 2)
  const text = lines.slice(start, end + 1).join('\n') + '\n'
  fs.writeFileSync(join(output, 'coverage-text.txt'), text)
  assert.equal(text, row.text)
  const summaryStart = lines.findIndex((line) =>
    stripANSI(line).includes('Coverage summary')
  )
  const summaryEnd = lines.findIndex(
    (line, index) => index > summaryStart && /^=+$/.test(stripANSI(line).trim())
  )
  assert(summaryStart >= 0 && summaryEnd > summaryStart)
  const textSummary =
    lines.slice(summaryStart - 1, summaryEnd + 1).join('\n') + '\n'
  fs.writeFileSync(join(output, 'coverage-text-summary.txt'), textSummary)
  assert.equal(textSummary, row.textSummary)
  assert.deepEqual(
    fs.readdirSync(join(output, 'coverage')).sort(),
    Object.keys(row.coverageFiles).sort()
  )
  for (const [file, expected] of Object.entries(row.coverageFiles)) {
    const bytes = fs.readFileSync(join(output, 'coverage', file), 'utf8')
    assert.deepEqual(
      canonical(file.endsWith('.json') ? JSON.parse(bytes) : bytes),
      expected
    )
  }
  for (const [file, value] of Object.entries(row.sourceFiles))
    assert.equal(sha(fs.readFileSync(join(fixture, file))), value.sha256)
  assert.equal(
    fs.readFileSync(join(fixture, 'vitest.config.mjs'), 'utf8'),
    row.config
  )
  assert.deepEqual(fs.readdirSync(join(fixture, '__snapshots__')), [])
  fs.writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        name,
        node: process.version,
        provider: row.provider,
        mode: row.mode,
        completeCasesAndJSONCoverageMap: true,
        completeMapsAndReports: true,
        completeANSITextAndSummaryBytes: true,
        moduleTraceQualified: row.moduleTrace !== undefined,
        sourceAndConfigHeld: true,
        physicallyJoined: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  if (joined) fs.rmSync(fixture, { recursive: true, force: true })
  fs.writeFileSync(
    join(output, 'CLOSED.json'),
    JSON.stringify({
      physicallyJoined: joined,
      fixtureRetired: !fs.existsSync(fixture),
    }) + '\n'
  )
}
