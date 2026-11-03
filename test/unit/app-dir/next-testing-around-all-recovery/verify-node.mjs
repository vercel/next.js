import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
import { compareObservation, standardReport } from './compare.mjs'

const [consumerArg, outputArg, phase, variant, modeArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: verify-node.mjs <source-or-consumer-root> <new-output-directory> <setup|teardown> <gated|root-gated> [development|production]'
)
assert(['setup', 'teardown'].includes(phase))
assert(['gated', 'root-gated'].includes(variant))
assert(!modeArg || ['development', 'production'].includes(modeArg))
const modes = modeArg ? [modeArg] : ['development', 'production']
const consumer = fs.realpathSync(consumerArg)
const output = path.resolve(outputArg)
fs.mkdirSync(output)
const base = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'node-records'
)
const manifest = JSON.parse(fs.readFileSync(base + '/REFERENCE.json'))
const load = createRequire(consumer + '/package.json')
const next = path.dirname(load.resolve('next/package.json'))
const bin = load.resolve('next/dist/bin/next')
const sha = (value) => createHash('sha256').update(value).digest('hex')
const save = (where, name, value) =>
  fs.writeFileSync(
    path.join(where, name),
    JSON.stringify(value, null, 2) + '\n',
    { flag: 'wx' }
  )
const pins = Object.fromEntries(
  [
    'package.json',
    'dist/bin/next',
    'dist/experimental/testing/runner/lifecycle.js',
    'dist/experimental/testing/runner/index.js',
    'dist/experimental/testing/runner/fixtures.js',
    'dist/experimental/testing/assertions/index.js',
    'dist/experimental/testing/reporting/task-updates.js',
    'dist/experimental/testing/execution/worker.js',
  ].map((name) => [name, sha(fs.readFileSync(next + '/' + name))])
)
const profiles = []
for (const mode of modes) {
  const label = `${process.versions.node.split('.')[0]}-${mode}-${phase}-${variant === 'gated' ? 'suite-errors' : variant}`
  assert(manifest.profiles[label], 'A genuine actual-engine model is required')
  const out = path.join(output, mode)
  fs.mkdirSync(out)
  const bodyName = variant + '.test.mjs.txt'
  const body = fs.readFileSync(path.join(base, bodyName))
  assert.equal(sha(body), manifest.bodyPins[bodyName])
  assert.equal(sha(body), manifest.profiles[label].bodySHA256)
  const expected = JSON.parse(
    fs.readFileSync(path.join(base, `${phase}-${variant}-model.json`))
  )
  const fixture = fs.mkdtempSync(
    path.join(consumer, '.next-around-all-recovery-')
  )
  fs.symlinkSync(consumer + '/node_modules', fixture + '/node_modules', 'dir')
  fs.writeFileSync(
    fixture + '/package.json',
    '{"type":"module","private":true}\n'
  )
  fs.writeFileSync(fixture + '/suite.test.mjs', body)
  fs.writeFileSync(out + '/AUTHORED-SOURCE.mjs.txt', body)
  const reporter = `import fs from 'node:fs';const save=value=>fs.appendFileSync(process.env.AROUND_REPORTER,JSON.stringify(value)+'\\n');const error=e=>({name:e?.name,message:e?.message,stack:e?.stack,...e});export default class{onUserConsoleLog(log){save({hook:'console',log})}onTestRunEnd(modules,errors,reason){save({hook:'end',reason,errors:errors.map(error),modules:modules.map(module=>({state:module.state(),errors:module.errors().map(error),suites:[...module.children.allSuites()].map(suite=>({name:suite.fullName,state:suite.state(),errors:suite.errors().map(error)}))}))})}}\n`
  fs.writeFileSync(fixture + '/reporter.mjs', reporter)
  fs.writeFileSync(
    fixture + '/next.config.mjs',
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  const test = {
    include: ['suite.test.mjs'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 5000,
    hookTimeout: 5000,
    includeTaskLocation: false,
    mode,
    environment: 'node',
  }
  fs.writeFileSync(
    fixture + '/next.test.config.json',
    JSON.stringify({ test }) + '\n'
  )
  fs.writeFileSync(out + '/trace.jsonl', '')
  fs.writeFileSync(out + '/reporter.jsonl', '')
  const args = [
    bin,
    'test',
    fixture,
    '--run',
    '--reporter=json',
    '--reporter=' + fixture + '/reporter.mjs',
    '--outputFile=' + out + '/report.json',
  ]
  const env = {
    ...process.env,
    AROUND_PHASE: phase,
    AROUND_FOLLOWUP: variant,
    AROUND_TRACE: out + '/trace.jsonl',
    AROUND_REPORTER: out + '/reporter.jsonl',
    NODE_ENV: mode,
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
  }
  for (const name of [
    'CI',
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[name]
  save(out, 'INPUTS.json', {
    label,
    consumer,
    fixture,
    mode,
    phase,
    variant,
    actualNode: process.version,
    actualExecutable: process.execPath,
    args,
    test,
    sourceSHA256: sha(body),
    reporterSHA256: sha(reporter),
    pins,
    bounds: {
      cli: 120000,
      test: 5000,
      hook: 5000,
      around: 100,
      settle: variant === 'gated' ? 250 : 1000,
    },
  })
  let owner
  try {
    owner = await runOwnedNode(args, {
      cwd: fixture,
      env,
      auditDir: out + '/owners',
      timeoutMs: 120000,
    })
    save(out, 'OWNER.json', owner)
    fs.writeFileSync(out + '/stdout.log', owner.stdout)
    fs.writeFileSync(out + '/stderr.log', owner.stderr)
    assertOwnedNodeCompleted(owner, 'Actual AroundAll recovery ' + label)
    const parseRows = (name) =>
      fs
        .readFileSync(path.join(out, name), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    const report = JSON.parse(fs.readFileSync(out + '/report.json'))
    const observed = {
      status: owner.status,
      rows: parseRows('trace.jsonl'),
      reporterRows: parseRows('reporter.jsonl'),
      cases: report.testResults.flatMap((file) =>
        file.assertionResults.map((test) => ({
          name: test.fullName,
          state: test.status,
          failureMessages: test.failureMessages,
        }))
      ),
      summary: Object.fromEntries(
        Object.entries(report).filter(
          ([key]) => key.startsWith('num') || key === 'success'
        )
      ),
      allRuntimeOwnersJoined: true,
    }
    save(out, 'OBSERVED.json', observed)
    save(out, 'STANDARD-ACTUAL.json', standardReport(report))
    save(out, 'STANDARD-GENUINE.json', expected.report)
    const verification = compareObservation(
      observed,
      report,
      expected,
      fixture,
      phase,
      variant
    )
    const result = {
      label,
      mode,
      phase,
      variant,
      ...verification,
      allRuntimeOwnersJoined: true,
      originalAuthoredSourcesAndBoundsHeld: true,
      ungatedAbandonmentRemainsSeparateUnqualifiedBoundary: true,
    }
    profiles.push(result)
    save(out, 'VERIFIED.json', result)
    console.log(JSON.stringify(result))
  } finally {
    const joined =
      !!owner &&
      !owner.auditMissing &&
      !owner.missingStartupRecords.length &&
      !owner.pendingRegistrations.length &&
      !owner.registrationFailures.length &&
      !owner.timedOut &&
      !owner.leakedProcesses.length &&
      !owner.cleanupFailures.length
    if (joined) fs.rmSync(fixture, { recursive: true, force: true })
    save(out, 'CLOSED.json', {
      allRuntimeOwnersJoined: joined,
      fixtureRetired: !fs.existsSync(fixture),
      processExitDoesNotProveAuthoredOperationSettlement: true,
    })
    for (const [name, pin] of Object.entries(pins))
      assert.equal(sha(fs.readFileSync(next + '/' + name)), pin)
  }
}
save(output, 'VERIFIED.json', {
  profiles,
  allPassed: profiles.length === modes.length,
  actualCases: profiles.reduce((total, row) => total + row.actualCases, 0),
  wholeRows: profiles.reduce((total, row) => total + row.wholeRows, 0),
  allRuntimeOwnersJoined: true,
  originalAuthoredSourcesAndBoundsHeld: true,
  ungatedAbandonmentRemainsSeparateUnqualifiedBoundary: true,
})
