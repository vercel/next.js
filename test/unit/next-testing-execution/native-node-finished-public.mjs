import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, profile] = process.argv.slice(2)
const consumer = path.resolve(consumerArg),
  output = path.resolve(outputArg),
  source = process.argv.includes('--source'),
  here = path.dirname(fileURLToPath(import.meta.url))
const load = createRequire(path.join(consumer, 'package.json'))
if (!source)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const row = JSON.parse(
  fs.readFileSync(path.join(here, 'native-node-finished-pristine.json'))
).rows.find((row) => row.name === profile)
assert(row)
assert.equal(
  createHash('sha256').update(row.body).digest('hex'),
  row.bodySHA256
)
const fixture = fs.mkdtempSync(
  path.join(consumer, '.next-native-node-finished-')
)
// Verify the complete authored message; retain distinct raw frame renderings.
const errorMessage = (value) => value.split(/\n(?: {4}at | ❯ )/u)[0]
const canonical = (map) =>
  Object.fromEntries(
    Object.entries(map).map(([file, data]) => [
      file === 'total' ? file : path.basename(file),
      {
        ...data,
        ...('path' in data ? { path: path.basename(data.path) } : {}),
      },
    ])
  )
const caseProjection = (report) => ({
  numTotalTests: report.numTotalTests,
  numPassedTests: report.numPassedTests,
  numFailedTests: report.numFailedTests,
  numPendingTests: report.numPendingTests,
  numTodoTests: report.numTodoTests,
  success: report.success,
  files: report.testResults.map((file) => ({
    status: file.status,
    message: file.message,
    cases: file.assertionResults.map((test) =>
      Object.fromEntries(
        [
          'ancestorTitles',
          'fullName',
          'status',
          'title',
          'failureMessages',
          'meta',
          'tags',
          'benchmarks',
        ]
          .filter((key) => key in test)
          .map((key) => [
            key,
            key === 'failureMessages' ? test[key].map(errorMessage) : test[key],
          ])
      )
    ),
  })),
})
fs.mkdirSync(output, { recursive: true })
try {
  fs.writeFileSync(fixture + '/body.test.mjs', row.entry)
  fs.writeFileSync(fixture + '/subject.mjs', row.subject)
  fs.writeFileSync(fixture + '/vitest.config.mjs', row.config)
  fs.writeFileSync(fixture + '/package.json', '{"type":"module"}\n')
  fs.writeFileSync(
    fixture + '/next.config.mjs',
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  if (Object.keys(row.snapshotsBefore).length) {
    fs.mkdirSync(fixture + '/__snapshots__')
    for (const [name, bytes] of Object.entries(row.snapshotsBefore))
      fs.writeFileSync(fixture + '/__snapshots__/' + name, bytes)
  }
  const trace = path.join(output, 'trace.jsonl')
  fs.writeFileSync(
    fixture + '/trace-reporter.mjs',
    "import{appendFileSync}from'node:fs'\nconst row=value=>appendFileSync(" +
      JSON.stringify(trace) +
      ",JSON.stringify(value)+'\\n')\nexport default class{onTestModuleEnd(module){row({event:'module-end',state:module.state(),errors:module.errors().map(error=>({name:error.name,message:error.message,stack:error.stack}))})}onTestRunEnd(modules,errors,reason){row({event:'run-end',reason,modules:modules.map(module=>({state:module.state(),errors:module.errors().map(error=>({name:error.name,message:error.message,stack:error.stack}))})),errors:errors.map(error=>({name:error.name,message:error.message,stack:error.stack,type:error.type}))})}}\n"
  )
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    FORCE_COLOR: '0',
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
      source
        ? consumer + '/packages/next/dist/bin/next'
        : load.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      ...(profile === 'update' ? ['--update'] : []),
      '--reporter=json',
      '--reporter=./trace-reporter.mjs',
      '--outputFile=' + output + '/cases.json',
    ],
    { cwd: fixture, env, auditDir: output + '/owners', timeoutMs: 120000 }
  )
  fs.writeFileSync(
    output + '/OWNER.json',
    JSON.stringify(owner, null, 2) + '\n'
  )
  fs.writeFileSync(output + '/stdout.log', owner.stdout)
  fs.writeFileSync(output + '/stderr.log', owner.stderr)
  assertOwnedNodeCompleted(owner, 'public Node finished ' + profile)
  assert.equal(owner.status, row.exitCode, owner.stderr)
  const report = JSON.parse(fs.readFileSync(output + '/cases.json'))
  const authoredFrames = (value) =>
    value.testResults.flatMap((file) =>
      file.assertionResults.flatMap((test) =>
        test.failureMessages.flatMap((message) =>
          [...message.matchAll(/body\.test\.mjs:(\d+):(\d+)/g)].map(
            (match) => ({
              file: 'body.test.mjs',
              line: Number(match[1]),
              column: Number(match[2]),
            })
          )
        )
      )
    )
  const actualFrames = authoredFrames(report),
    referenceFrames = authoredFrames(row.cases)
  assert(actualFrames.length > 0 && referenceFrames.length > 0)
  assert.deepEqual(
    actualFrames.map(({ file, line }) => ({ file, line })),
    referenceFrames.map(({ file, line }) => ({ file, line }))
  )
  fs.writeFileSync(
    output + '/AUTHORED-FRAMES.json',
    JSON.stringify(
      {
        actual: actualFrames,
        reference: referenceFrames,
        columnsEqual:
          JSON.stringify(actualFrames) === JSON.stringify(referenceFrames),
        scope:
          'Exact authored file/line checked; column and presentation parity remain unqualified, with complete raw reports retained.',
      },
      null,
      2
    ) + '\n'
  )
  assert.deepEqual(caseProjection(report), caseProjection(row.cases))
  const actualTrace = fs
    .readFileSync(trace, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse)
  // Raw type/stack fields are retained; shared native reporter type projection is separately queued.
  const traceProjection = (rows) =>
    rows.map((item) => ({
      ...item,
      ...(item.modules
        ? {
            modules: item.modules.map((module) => ({
              ...module,
              errors: module.errors.map(({ name, message }) => ({
                name,
                message,
              })),
            })),
          }
        : {}),
      ...(item.errors
        ? {
            errors: item.errors.map(({ name, message }) => ({ name, message })),
          }
        : {}),
    }))
  assert.deepEqual(traceProjection(actualTrace), traceProjection(row.trace))
  const reports = fs.existsSync(fixture + '/coverage')
    ? fs.readdirSync(fixture + '/coverage').sort()
    : []
  assert.deepEqual(reports, Object.keys(row.reports).sort())
  fs.mkdirSync(output + '/coverage')
  for (const [name, expected] of Object.entries(row.reports)) {
    const actual = fs.readFileSync(fixture + '/coverage/' + name, 'utf8')
    if (name.endsWith('.json'))
      assert.deepEqual(
        canonical(JSON.parse(actual)),
        canonical(JSON.parse(expected))
      )
    else assert.equal(actual, expected)
    fs.writeFileSync(output + '/coverage/' + name, actual)
  }
  const snapshots = fs.existsSync(fixture + '/__snapshots__')
    ? Object.fromEntries(
        fs
          .readdirSync(fixture + '/__snapshots__')
          .map((name) => [
            name,
            fs.readFileSync(fixture + '/__snapshots__/' + name, 'utf8'),
          ])
      )
    : {}
  assert.deepEqual(snapshots, row.snapshotsAfter)
  fs.writeFileSync(
    output + '/SNAPSHOTS.json',
    JSON.stringify(snapshots, null, 2) + '\n'
  )
  fs.writeFileSync(
    output + '/CHECKS.json',
    JSON.stringify(
      {
        profile,
        actualPublicNode: true,
        completeAuthoredMessagesAndCaseFields: true,
        authoredFrameLinesEqual: true,
        frameColumnsAndRawPresentationRecorded: true,
        actualNativeErrorChannel: true,
        wholeCoverageJSONSummaryLCOV: true,
        exactSnapshotBytes: true,
        allOwnersJoined: true,
        rawSharedReporterTypeAndJSONMapFieldsRetainedForSeparateIntegration: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  fs.rmSync(fixture, { recursive: true, force: true })
  fs.writeFileSync(
    output + '/CLOSED.json',
    JSON.stringify({ fixtureRetired: !fs.existsSync(fixture) }) + '\n'
  )
}
