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
const [consumerArg, outputArg, mode = 'development', group = 'positive'] =
  process.argv.slice(2)
assert(['development', 'production'].includes(mode))
assert(
  ['positive', 'exact-multiple', 'load-failure', 'load-owned'].includes(group)
)
const consumer = path.resolve(consumerArg)
const output = path.resolve(outputArg)
const inputs = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'normal-suite-records'
)
const load = createRequire(path.join(consumer, 'package.json'))
const pkg = path.dirname(load.resolve('next/package.json'))
const bin = load.resolve('next/dist/bin/next')
const major = process.versions.node.split('.')[0]
const modelName = `${major}-${mode}-${group}`
const genuineReport = JSON.parse(
  fs.readFileSync(path.join(inputs, `${modelName}-report.json`))
)
const genuineObserved = JSON.parse(
  fs.readFileSync(path.join(inputs, `${modelName}-observed.json`))
)
const body = fs.readFileSync(path.join(inputs, `${group}.test.mjs.txt`))
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
fs.mkdirSync(output, { recursive: true })
const save = (name, value) =>
  fs.writeFileSync(
    path.join(output, name),
    JSON.stringify(value, null, 2) + '\n'
  )
const pins = Object.fromEntries(
  [
    'package.json',
    'dist/bin/next',
    'dist/experimental/testing/runner/collector.js',
    'dist/experimental/testing/runner/index.js',
    'dist/experimental/testing/vitest.js',
  ].map((name) => [name, sha(fs.readFileSync(path.join(pkg, name)))])
)
const fixture = fs.mkdtempSync(path.join(consumer, '.next-normal-suite-api-'))
fs.writeFileSync(path.join(fixture, 'package.json'), '{"type":"module"}\n')
fs.writeFileSync(path.join(fixture, 'suite.test.mjs'), body)
fs.symlinkSync(
  path.join(consumer, 'node_modules'),
  path.join(fixture, 'node_modules'),
  'dir'
)
fs.writeFileSync(
  path.join(fixture, 'next.config.mjs'),
  `export default ${JSON.stringify({ turbopack: { root: consumer } })}\n`
)
fs.writeFileSync(
  path.join(fixture, 'next.test.config.json'),
  JSON.stringify({
    maxWorkers: 1,
    projects: [
      {
        name: 'normal-suite-api',
        mode,
        environment: 'node',
        include: ['suite.test.mjs'],
      },
    ],
  }) + '\n'
)
const reportFile = path.join(output, 'report.json')
const observedFile = path.join(output, 'OBSERVED.json')
const env = {
  ...process.env,
  NODE_ENV: mode,
  NEXT_TELEMETRY_DISABLED: '1',
  FORCE_COLOR: '0',
  NEXT_SUITE_RETURN_OBSERVATION: observedFile,
}
for (const name of [
  'CI',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[name]
function standardReport(report) {
  const { next, startTime, ...standard } = report
  return {
    ...standard,
    testResults: report.testResults.map(
      ({ startTime, endTime, name, assertionResults, ...file }) => ({
        ...file,
        name: path.basename(name),
        assertionResults: assertionResults.map(({ duration, ...test }) => test),
      })
    ),
  }
}
const args = [
  bin,
  'test',
  fixture,
  '--run',
  '--reporter=json',
  `--outputFile=${reportFile}`,
]
save('INPUTS.json', {
  runtime: process.version,
  executable: fs.realpathSync(process.execPath),
  args,
  mode,
  group,
  package: pkg,
  productPins: pins,
  authoredSHA256: sha(body),
  modelName,
  standardComparisonExclusions: [
    'startTime',
    'testResults.startTime',
    'testResults.endTime',
    'assertionResults.duration',
  ],
  filenameNormalization: 'actual basename only',
  nextEnvelopePreservedSeparately: true,
})
let owner
let failure
try {
  owner = await runOwnedNode(args, {
    cwd: fixture,
    env,
    auditDir: path.join(output, 'owners'),
    timeoutMs: 120000,
  })
  save('OWNER.json', owner)
  fs.writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, `normal SuiteAPI ${mode}/${group}`)
  assert.equal(owner.status, group === 'positive' ? 0 : 1, owner.stderr)
  assert.equal(owner.signal, null)
  const report = JSON.parse(fs.readFileSync(reportFile))
  const observed = JSON.parse(fs.readFileSync(observedFile))
  assert.deepEqual(observed, genuineObserved)
  save('STANDARD-NEXT.json', standardReport(report))
  save('STANDARD-GENUINE.json', standardReport(genuineReport))
  save('NEXT-ENVELOPE.json', report.next)
  assert.equal(report.next.version, 1)
  assert.deepEqual(standardReport(report), standardReport(genuineReport))
  save('CHECKS.json', {
    actualCompleteObservedModelEqual: true,
    allReferenceStandardFieldsEqual: true,
    nextEnvelopeRetained: true,
    originalAuthoredBytesHeld:
      sha(fs.readFileSync(path.join(fixture, 'suite.test.mjs'))) === sha(body),
    actualOwnersJoined: true,
  })
} catch (error) {
  failure = error
  save('ERROR.json', {
    name: error?.name,
    message: error?.message,
    stack: error?.stack,
  })
} finally {
  const after = Object.fromEntries(
    Object.keys(pins).map((name) => [
      name,
      sha(fs.readFileSync(path.join(pkg, name))),
    ])
  )
  assert.deepEqual(after, pins)
  save('PRODUCT-AFTER.json', after)
  if (
    owner &&
    !owner.timedOut &&
    owner.leakedProcesses.length === 0 &&
    owner.cleanupFailures.length === 0
  )
    fs.rmSync(fixture, { recursive: true, force: true })
  save('CLOSED.json', {
    passed: !failure,
    actualOwnerReceiptRetained: !!owner,
    productPinsHeld: true,
    fixtureRetired: !fs.existsSync(fixture),
  })
}
if (failure) throw failure
