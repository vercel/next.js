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
  readdirSync,
  existsSync,
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
  load = createRequire(join(consumer, 'package.json')),
  row = readCoverageFixture(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/istanbul-provider/inactive-focused-pristine.json'
    )
  ).rows.find((r) => r.name === profile)
assert(row)
mkdirSync(output, { recursive: true })
const fixture = mkdtempSync(join(consumer, '.next-inactive-focused-'))

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
  const reporter = join(output, 'reporter.mjs')
  writeFileSync(
    reporter,
    `import fs from 'node:fs'
const observed={lifecycle:[],declarations:[],taskStates:[],errors:0}
const tests=module=>[...module.children.allTests()]
const errorCount=module=>module.errors().length+tests(module).reduce((n,test)=>n+(test.result().errors??[]).length,0)
export default class Reporter {
 onTestModuleCollected(module){observed.lifecycle.push(['collected',module.state()]);observed.declarations=tests(module).map(test=>[test.name,test.options.mode,test.result().state]);observed.errors+=errorCount(module)}
 onTestModuleEnd(module){observed.lifecycle.push(['module-end',module.state()]);observed.taskStates=tests(module).map(test=>[test.name,test.result().state]);observed.errors+=errorCount(module)}
 onTestRunEnd(_modules,errors,reason){observed.lifecycle.push(['run-end',reason]);observed.errors+=errors.length;fs.writeFileSync(${JSON.stringify(join(output, 'SELECTION.json'))},JSON.stringify(observed))}
}
`
  )
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: row.mode,
    NEXT_TELEMETRY_DISABLED: '1',
    ACTUAL_FOCUS_EFFECTS: join(output, 'effects.txt'),
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
  const raw = JSON.parse(readFileSync(join(output, 'cases.json')))
  assert.equal(
    raw.next.events.filter((event) => event.type === 'case-start').length,
    row.actualCaseStarts
  )
  assertSnapshotReport(raw, row.expected)
  assert.equal(raw.numTotalTests, row.expected.cases.length)
  assert.equal(raw.numTodoTests, row.expected.todo)
  assert.equal(raw.success, row.exitCode === 0)
  assert.deepEqual(
    raw.testResults.map((file) => file.status),
    row.expected.fileStates
  )
  const selection = JSON.parse(readFileSync(join(output, 'SELECTION.json')))
  assert.deepEqual(selection.lifecycle, row.lifecycle)
  assert.deepEqual(selection.declarations, row.declarations)
  assert.deepEqual(selection.taskStates, row.taskStates)
  assert.equal(selection.errors, 0)
  const actualEffects = existsSync(join(output, 'effects.txt'))
    ? readFileSync(join(output, 'effects.txt'), 'utf8')
    : ''
  assert.equal(actualEffects, row.effects)
  assert.equal(existsSync(join(fixture, 'coverage')), false)
  assert.deepEqual(readdirSync(join(fixture, '__snapshots__')), [])
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        profile,
        selectionModesAndTaskStates: true,
        caseOutcomesAndSnapshotSummary: true,
        lifecycleOrder: true,
        actualEffectsAndCaseStarts: true,
        noCoverageOutput: true,
        noStateOrResultSynthesized: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
