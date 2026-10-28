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
} from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, profile] = process.argv.slice(2),
  consumer = resolve(consumerArg),
  output = resolve(outputArg),
  load = createRequire(join(consumer, 'package.json')),
  row = JSON.parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        'fixtures/istanbul-provider/focused-inactive-pristine.json'
      )
    )
  ).rows.find((r) => r.name === profile)
assert(row)
mkdirSync(output, { recursive: true })
const fixture = mkdtempSync(join(consumer, '.next-focused-inactive-')),
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
  declarations = (value) => {
    if (Array.isArray(value)) return value.map(declarations)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !['state', 'stack'].includes(key))
          .map(([key, value]) => [key, declarations(value)])
      )
    return value
  }
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
  const reporter = join(output, 'reporter.mjs')
  writeFileSync(
    reporter,
    `import fs from 'node:fs'
const rows=[];const error=e=>({name:e.name,message:e.message,stack:e.stack});const tree=t=>({type:t.type,name:t.type==='module'?'suite.test.mjs':t.name,state:t.type==='test'?t.result().state:t.state(),...(t.type==='module'?{}:{mode:t.options.mode}),errors:t.type==='test'?(t.result().errors??[]).map(error):t.errors().map(error),...(t.type==='test'?{}:{children:[...t.children].map(tree)})});const save=()=>fs.writeFileSync(${JSON.stringify(join(output, 'RAW-MODULES.json'))},JSON.stringify(rows,null,2));export default class{onTestModuleCollected(m){rows.push({event:'collected',tree:tree(m)});save()}onTestModuleEnd(m){rows.push({event:'module-end',tree:tree(m)});save()}onTestRunEnd(modules,errors,reason){rows.push({event:'run-end',reason,errors:errors.map(error),modules:modules.map(tree)});save()}}
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
  assertOwnedNodeCompleted(
    owner,
    'actual inactive focused countermeasure ' + profile
  )
  assert.equal(owner.status, row.exitCode, owner.stderr)
  const report = canonical(JSON.parse(readFileSync(join(output, 'cases.json'))))
  delete report.next
  delete report.startTime
  for (const file of report.testResults) {
    delete file.startTime
    delete file.endTime
    for (const test of file.assertionResults) delete test.duration
  }
  const modules = canonical(
    JSON.parse(readFileSync(join(output, 'RAW-MODULES.json')))
  )
  assert.deepEqual(
    modules.find((r) => r.event === 'collected'),
    row.moduleTrace.find((r) => r.event === 'collected')
  )
  assert.deepEqual(declarations(modules), declarations(row.moduleTrace))
  if (row.wholeGraphQualified) {
    assert.deepEqual(report, row.standardReport)
    assert.deepEqual(modules, row.moduleTrace)
  }
  assert.deepEqual(readdirSync(join(fixture, '__snapshots__')), [])
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        profile,
        earlyCollectedGraphExact: true,
        actualDeclarationOptionsExact: true,
        activeOnlyNormalizationPreserved: true,
        wholeStandardReportEqual: isDeepStrictEqual(report, row.standardReport),
        wholeGraphEqual: isDeepStrictEqual(modules, row.moduleTrace),
        inactiveFinalPendingProducerQualified: row.wholeGraphQualified,
        rawWholeReportsRetained: true,
        noStateOrResultSynthesized: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
