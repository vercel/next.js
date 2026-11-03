import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify-node.mjs <source-or-consumer-root> <new-output-directory>'
)
const consumer = fs.realpathSync(consumerArg)
const output = path.resolve(outputArg)
fs.mkdirSync(output)
const base = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'node-records'
)
const manifest = JSON.parse(fs.readFileSync(base + '/REFERENCE.json'))
const profiles = []
const load = createRequire(consumer + '/package.json')
const next = path.dirname(load.resolve('next/package.json'))
const bin = load.resolve('next/dist/bin/next')
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const save = (where, name, value) =>
  fs.writeFileSync(
    path.join(where, name),
    JSON.stringify(value, null, 2) + '\n'
  )
const pins = Object.fromEntries(
  [
    'package.json',
    'dist/bin/next',
    'dist/experimental/testing/runner/collector.js',
    'dist/experimental/testing/runner/fixtures.js',
    'dist/experimental/testing/runner/fixtures.js',
    'dist/experimental/testing/assertions/index.js',
    'dist/experimental/testing/assertions/utilities.js',
    'dist/experimental/testing/assertions/fake-timers-core.js',
    'dist/experimental/testing/client/fake-timers.js',
    'dist/experimental/testing/client/runtime.js',
    'dist/experimental/testing/mocking/module-cache.js',
    'dist/experimental/testing/vitest.js',
  ].map((name) => [name, sha(fs.readFileSync(next + '/' + name))])
)
for (const mode of ['development', 'production']) {
  const label = process.versions.node.split('.')[0] + '-' + mode
  assert(
    manifest.profiles[label],
    'A genuine model is required for this actual Node engine'
  )
  const out = output + '/' + mode
  fs.mkdirSync(out)
  const body = fs.readFileSync(base + '/suite.test.mjs.txt')
  assert.equal(sha(body), manifest.bodySHA256)
  const expected = JSON.parse(
    fs.readFileSync(base + '/' + label + '-model.json')
  )
  const expectedReport = JSON.parse(
    fs.readFileSync(base + '/' + label + '-report.json')
  )
  const fixture = fs.mkdtempSync(
    path.join(consumer, '.next-fixture-registration-order-')
  )
  fs.symlinkSync(consumer + '/node_modules', fixture + '/node_modules', 'dir')
  fs.writeFileSync(
    fixture + '/package.json',
    JSON.stringify({ type: 'module', private: true }) + '\n'
  )
  fs.writeFileSync(fixture + '/suite.test.mjs', body)
  const reporter = `import fs from 'node:fs';export default class{onUserConsoleLog(log){fs.appendFileSync(process.env.FIXTURE_ORDER_LOG,JSON.stringify({hook:'console',log})+'\\n')}onTestRunEnd(modules,errors,reason){fs.appendFileSync(process.env.FIXTURE_ORDER_LOG,JSON.stringify({hook:'end',reason,errors:errors.map(error=>({name:error.name,message:error.message})),modules:modules.map(module=>({state:module.state(),errors:module.errors()}))})+'\\n')}}\n`
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
  fs.writeFileSync(out + '/console.jsonl', '')
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
    NODE_ENV: mode,
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
    FIXTURE_ORDER_LOG: out + '/console.jsonl',
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
    mode,
    label,
    consumer,
    actualNode: process.version,
    args,
    sourceSHA256: sha(body),
    test,
    pins,
    bounds: { cli: 120000, test: 5000, hook: 5000 },
  })
  function standard(report) {
    const { next, startTime, ...data } = report
    return {
      ...data,
      testResults: report.testResults.map(
        ({ startTime, endTime, name, assertionResults, ...file }) => ({
          ...file,
          name: path.basename(name),
          assertionResults: assertionResults.map(
            ({ duration, ...test }) => test
          ),
        })
      ),
    }
  }
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
    assertOwnedNodeCompleted(owner, 'Next actual fixture context ' + label)
    const report = fs.existsSync(out + '/report.json')
      ? JSON.parse(fs.readFileSync(out + '/report.json'))
      : null
    const logs = fs
      .readFileSync(out + '/console.jsonl', 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    const rows = logs
      .filter((row) => row.hook === 'console')
      .flatMap((row) =>
        row.log.content
          .split('\n')
          .filter((line) => line.startsWith('FIXTURE_ORDER_ROW '))
          .map((line) => JSON.parse(line.slice('FIXTURE_ORDER_ROW '.length)))
      )
    const terminal = logs.filter((row) => row.hook === 'end')
    const observed = {
      status: owner.status,
      rows,
      cases: report?.testResults.flatMap((file) =>
        file.assertionResults.map((test) => ({
          name: test.fullName,
          state: test.status,
        }))
      ),
      summary: report
        ? Object.fromEntries(
            Object.entries(report).filter(
              ([key]) => key.startsWith('num') || key === 'success'
            )
          )
        : null,
      terminal,
      allOwnersJoined: true,
    }
    save(out, 'OBSERVED.json', observed)
    if (report) {
      save(out, 'STANDARD-NEXT.json', standard(report))
      save(out, 'STANDARD-GENUINE.json', standard(expectedReport))
      save(out, 'NEXT-ENVELOPE.json', report.next)
    }

    assert.equal(owner.status, 0, owner.stdout + owner.stderr)
    assert.deepEqual(
      { rows, cases: observed.cases, summary: observed.summary },
      { rows: expected.rows, cases: expected.cases, summary: expected.summary }
    )
    assert.equal(report.next.version, 1)
    assert.deepEqual(standard(report), standard(expectedReport))
    assert.equal(terminal.length, 1)
    assert.equal(terminal[0].reason, 'passed')
    assert.deepEqual(terminal[0].errors, [])
    assert(
      terminal[0].modules.every(
        (module) => module.state === 'passed' && module.errors.length === 0
      )
    )
    save(out, 'CHECKS.json', {
      allPassed: true,
      completeReferenceFieldsEqual: true,
      completeRowsCasesSummaryEqual: true,
      nextEnvelopeRetained: true,
      actualOwnersJoined: true,
    })
    profiles.push({
      label,
      actualNode: process.version,
      cases: observed.cases.length,
      wholeRows: rows.length,
      completeStandardFieldsAndWholeRowsEqual: true,
      actualOwnersJoined: true,
    })
  } finally {
    if (
      owner &&
      !owner.timedOut &&
      owner.leakedProcesses.length === 0 &&
      owner.cleanupFailures.length === 0
    )
      fs.rmSync(fixture, { recursive: true, force: true })
    save(out, 'CLOSED.json', {
      actualOwnerReceipt: !!owner,
      fixtureRetired: !fs.existsSync(fixture),
    })
    for (const [name, pin] of Object.entries(pins))
      assert.equal(sha(fs.readFileSync(next + '/' + name)), pin)
  }
}
save(output, 'VERIFIED.json', {
  allPassed: true,
  profiles,
  actualCases: profiles.reduce((sum, row) => sum + row.cases, 0),
  wholeRows: profiles.reduce((sum, row) => sum + row.wholeRows, 0),
  originalBoundsHeld: true,
  allPhysicalOwnersJoined: true,
  noWorkerAssertionOwnershipBrowserConcurrentOrRetryClaim: true,
})
console.log(
  JSON.stringify({
    allPassed: true,
    profiles: profiles.length,
    actualCases: profiles.reduce((sum, row) => sum + row.cases, 0),
    wholeRows: profiles.reduce((sum, row) => sum + row.wholeRows, 0),
  })
)
