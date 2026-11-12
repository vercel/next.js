'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { isDeepStrictEqual } = require('node:util')
const crypto = require('node:crypto')
const output = path.resolve(process.argv[2])
const consumer = path.resolve(__dirname, '../../..')
const project = fs.mkdtempSync(path.join(consumer, '.next-run-start-public-'))
const fixture = path.join(__dirname, 'root-run-start-fixtures')
const nextPackageFile = require.resolve('next/package.json')
const nextBin =
  process.argv[3] ||
  path.resolve(path.dirname(nextPackageFile), require(nextPackageFile).bin.next)
const hash = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const pins = {}
fs.mkdirSync(output, { recursive: true })
fs.symlinkSync(
  path.join(consumer, 'node_modules'),
  path.join(project, 'node_modules'),
  'dir'
)
fs.writeFileSync(
  path.join(project, 'next.config.mjs'),
  'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
)
for (const name of [
  'public-passive.test.mjs',
  'public-passive-reporter.mjs',
  'public-passive.config.mjs',
]) {
  const input = path.join(fixture, name + '.txt')
  pins[input] = hash(input)
  fs.copyFileSync(
    input,
    path.join(
      project,
      name === 'public-passive.config.mjs' ? 'next.test.config.mjs' : name
    )
  )
}
fs.writeFileSync(
  path.join(project, 'package.json'),
  '{"private":true,"type":"module"}\n'
)
function normalized(trace, report, root) {
  const specs = trace.find((row) => row.kind === 'start')?.specifications || []
  const ids = new Map(
    specs.map((spec) => [
      String(spec.taskId),
      'SPEC:' +
        JSON.stringify([
          spec.projectName,
          spec.moduleId.split(root).join('<PROJECT>'),
        ]),
    ])
  )
  function visit(value, key) {
    if (Array.isArray(value)) return value.map((item) => visit(item, key))
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([name, item]) => [name, visit(item, name)])
      )
    if (
      typeof value === 'number' &&
      ['startTime', 'endTime', 'duration', 'durationMs', 'timestamp'].includes(
        key
      )
    )
      return '<TIME>'
    if (typeof value === 'string')
      return (
        ['id', 'taskId'].includes(key) && ids.has(value)
          ? ids.get(value)
          : value
      )
        .split(root)
        .join('<PROJECT>')
    return value
  }
  return visit({ trace, report })
}
function differences(actual, expected, at = '') {
  if (isDeepStrictEqual(actual, expected)) return []
  if (
    !actual ||
    !expected ||
    typeof actual !== 'object' ||
    typeof expected !== 'object'
  )
    return [{ path: at, actual, expected }]
  return [
    ...new Set([...Object.keys(actual), ...Object.keys(expected)]),
  ].flatMap((key) => differences(actual[key], expected[key], at + '/' + key))
}
async function validateNextExtension(report, reference, trace) {
  assert.deepEqual(
    Object.keys(report).sort(),
    [...Object.keys(reference), 'next'].sort()
  )
  const extension = report.next
  assert.deepEqual(Object.keys(extension).sort(), [
    'events',
    'summary',
    'version',
  ])
  assert.equal(extension.version, 1)
  assert.match(extension.summary.runId, /^[a-f0-9-]{36}$/)
  const { runId, ...summary } = extension.summary
  const expectedSummary = {
    status: 'passed',
    files: {
      passed: reference.numPassedTestSuites,
      failed: reference.numFailedTestSuites,
      skipped: reference.numPendingTestSuites,
      cancelled: 0,
    },
    cases: {
      passed: reference.numPassedTests,
      failed: reference.numFailedTests,
      skipped: reference.numPendingTests + reference.numTodoTests,
      cancelled: 0,
    },
    attempts: { passed: 1, failed: 0, skipped: 0, cancelled: 0 },
    errors: 0,
    warnings: 0,
    attachments: 0,
  }
  assert.equal(reference.numTotalTests, 1)
  assert.equal(reference.success, true)
  assert.deepEqual(summary, expectedSummary)
  assert(extension.events.every((event) => event.runId === runId))
  const specification = trace.find((row) => row.kind === 'start')
    .specifications[0]
  const files = extension.events.filter((event) => event.type === 'file-start')
  assert.equal(files.length, 1)
  assert.equal(files[0].entry.id, specification.taskId)
  assert.equal(files[0].entry.file, specification.moduleId)
  assert.equal(files[0].entry.projectName, specification.projectName)
  assert.deepEqual(files[0].entry.profile, {
    id: 'passive-public',
    environment: 'node',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
  })
  const cases = extension.events.filter((event) => event.type === 'case-end')
  const expectedCase = reference.testResults[0].assertionResults[0]
  assert.equal(cases.length, 1)
  assert.equal(cases[0].entryId, specification.taskId)
  assert.equal(cases[0].testName, expectedCase.fullName)
  assert.equal(cases[0].status, expectedCase.status)
  assert.deepEqual(cases[0].errors, expectedCase.failureMessages)
  assert.deepEqual(cases[0].meta, expectedCase.meta)
  assert.deepEqual(cases[0].tags, expectedCase.tags)
  assert.deepEqual(cases[0].annotations, [])
  assert.equal(cases[0].attempt.retry, 0)
  assert.equal(cases[0].attempt.repeat, 0)
  // The maintained Next event-blob consumer validates every original event.
  const directory = path.join(output, 'next-protocol')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(
    path.join(directory, 'events.json'),
    JSON.stringify({
      version: 1,
      kind: 'next-test-results',
      referenceVersion: '5.0.4',
      projectDir: project,
      events: extension.events,
    }) + '\n'
  )
  const mergedFile = path.join(output, 'next-protocol-merged.json')
  const { mergeResultReports } = require(
    path.join(
      path.dirname(nextPackageFile),
      'dist/experimental/testing/reporting/machine.js'
    )
  )
  assert.equal(
    await mergeResultReports(directory, {
      projectDir: project,
      reporters: ['json'],
      outputFile: mergedFile,
    }),
    'passed'
  )
  const merged = JSON.parse(fs.readFileSync(mergedFile, 'utf8'))
  const { runId: mergedRunId, ...mergedSummary } = merged.next.summary
  assert.match(mergedRunId, /^[a-f0-9-]{36}$/)
  assert.deepEqual(mergedSummary, expectedSummary)
}

;(async () => {
  const { runOwnedNode, assertOwnedNodeCompleted } = await import(
    pathToFileURL(
      path.join(
        __dirname,
        '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
      )
    ).href
  )
  const env = {
    ...process.env,
    NODE_OPTIONS: '',
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    CI: '1',
    NO_COLOR: '1',
    PASSIVE_TRACE: path.join(output, 'trace.jsonl'),
    PASSIVE_STARTED: path.join(output, 'started'),
    PASSIVE_REPORT: path.join(output, 'report.json'),
    PASSIVE_CACHE: path.join(output, 'cache'),
    PASSIVE_ATTACHMENTS: path.join(output, 'attachments'),
  }
  delete env.FORCE_COLOR
  const argv = [nextBin, 'test', project]
  const result = await runOwnedNode(argv, {
    cwd: project,
    env,
    auditDir: path.join(output, 'processes'),
    timeoutMs: 90000,
  })
  fs.writeFileSync(path.join(output, 'stdout.log'), result.stdout)
  fs.writeFileSync(path.join(output, 'stderr.log'), result.stderr)
  assertOwnedNodeCompleted(result, 'actual passive public Run Start')
  const trace = fs.existsSync(env.PASSIVE_TRACE)
    ? fs
        .readFileSync(env.PASSIVE_TRACE, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse)
    : []
  const report = fs.existsSync(env.PASSIVE_REPORT)
    ? JSON.parse(fs.readFileSync(env.PASSIVE_REPORT, 'utf8'))
    : null
  const reference = JSON.parse(
    fs.readFileSync(path.join(fixture, 'public-passive.reference.json'), 'utf8')
  )
  await validateNextExtension(report, reference.rawReport, trace)
  const actualModel = normalized(trace, report, project)
  const referenceReport = Object.fromEntries(
    Object.entries(actualModel.report).filter(([key]) => key !== 'next')
  )
  const referenceModel = { trace: actualModel.trace, report: referenceReport }
  const expectedModel = normalized(
    reference.rawTrace,
    reference.rawReport,
    reference.referenceRoot
  )
  fs.writeFileSync(
    path.join(output, 'ACTUAL-NORMALIZED.json'),
    JSON.stringify(actualModel, null, 2) + '\n'
  )
  fs.writeFileSync(
    path.join(output, 'EXPECTED-NORMALIZED.json'),
    JSON.stringify(expectedModel, null, 2) + '\n'
  )
  const modelDifferences = differences(referenceModel, expectedModel)
  fs.writeFileSync(
    path.join(output, 'FULL-MODEL-DIFFERENCES.json'),
    JSON.stringify(modelDifferences, null, 2) + '\n'
  )
  for (const [input, pin] of Object.entries(pins))
    assert.equal(hash(input), pin)
  const summary = {
    actualNextCLI: true,
    nextBin,
    command: [process.execPath, ...argv],
    project,
    status: result.status,
    traceEqual: isDeepStrictEqual(actualModel.trace, expectedModel.trace),
    completeJSONEqual: isDeepStrictEqual(referenceReport, expectedModel.report),
    validatedNextExtension: true,
    wholeModelEqual:
      result.status === reference.referenceExitCode &&
      isDeepStrictEqual(referenceModel, expectedModel),
    originalFixturesHeld: true,
    fieldDropping: false,
    normalization:
      'Project paths, selected specification IDs and numeric time fields only; every reference JSON key is exact and only the intentional Next namespace is separately validated in full',
    differences: modelDifferences.length,
  }
  fs.writeFileSync(
    path.join(output, 'VERIFIED.json'),
    JSON.stringify(summary, null, 2) + '\n'
  )
  console.log(JSON.stringify(summary))
})()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    fs.rmSync(project, { recursive: true, force: true })
  })
