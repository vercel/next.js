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
const [consumerArg, outputArg, mode] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Use a consumer root and new evidence directory'
)
const consumer = fs.realpathSync(consumerArg),
  output = path.resolve(outputArg)
const directory = path.dirname(fileURLToPath(import.meta.url))
const engine = '20'
const corpus = JSON.parse(
  fs.readFileSync(path.join(directory, 'reference.json'))
)
assert.equal(corpus.referenceVersion, '5.0.4')
const source = fs.readFileSync(path.join(directory, 'require.test.mjs.txt'))
const sha = (value) => createHash('sha256').update(value).digest('hex')
assert.equal(sha(source), corpus.bodySHA256)
assert(['development', 'production'].includes(mode))
const reference = corpus.models[engine]?.[mode]
assert(reference, 'Requires a measured actual Node engine and mode')
assert(!fs.existsSync(output))
fs.mkdirSync(output, { recursive: true })
const save = (name, value) =>
  fs.writeFileSync(
    path.join(output, name),
    JSON.stringify(value, null, 2) + '\n'
  )
const load = createRequire(path.join(consumer, 'package.json'))
if (!process.argv.includes('--source'))
  for (const module of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(module))
const expectedRows = reference.authoredRows
const fixture = fs.mkdtempSync(
  path.join(consumer, '.next-test-native-require-')
)
fs.writeFileSync(path.join(fixture, 'require.test.mjs'), source)
fs.writeFileSync(path.join(output, 'require.test.mjs'), source)
fs.writeFileSync(
  path.join(fixture, 'package.json'),
  '{"private":true,"type":"module"}\n'
)
fs.writeFileSync(
  path.join(fixture, 'next.config.mjs'),
  'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
)
fs.writeFileSync(
  path.join(fixture, 'next.test.config.json'),
  JSON.stringify({
    test: {
      mode,
      environment: 'node',
      include: ['require.test.mjs'],
      isolate: true,
    },
  }) + '\n'
)
const env = {
  ...process.env,
  CI: '1',
  NODE_ENV: mode,
  NEXT_TELEMETRY_DISABLED: '1',
  TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
  NEXT_MOCK_REQUIRE_ROWS: path.join(output, 'rows.jsonl'),
}
for (const key of [
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[key]
const args = [
  load.resolve('next/dist/bin/next'),
  'test',
  fixture,
  '--run',
  '--reporter=json',
  '--outputFile=' + path.join(output, 'report.json'),
]
save('REQUEST.json', {
  consumer,
  fixture,
  engine,
  mode,
  actualNode: process.version,
  actualExecutable: process.execPath,
  args,
  sourceSHA256: sha(source),
  referenceReportSHA256: reference.genuineRawReportSHA256,
  referenceRowsSHA256: reference.genuineRowsSHA256,
})
const normalize = (report, root) => {
  const value = JSON.parse(JSON.stringify(report).split(root).join('<fixture>'))
  delete value.next
  delete value.startTime
  for (const file of value.testResults) {
    delete file.startTime
    delete file.endTime
    for (const test of file.assertionResults) delete test.duration
  }
  return value
}
let joined = false,
  passed = false
try {
  const owner = await runOwnedNode(args, {
    cwd: fixture,
    env,
    auditDir: path.join(output, 'owners'),
    timeoutMs: 120000,
  })
  save('OWNER.json', owner)
  fs.writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(
    owner,
    'actual independent native mocks and CommonJS require'
  )
  joined = true
  const actualRows = fs.existsSync(path.join(output, 'rows.jsonl'))
    ? fs.readFileSync(path.join(output, 'rows.jsonl'), 'utf8')
    : null
  const actualRaw = fs.existsSync(path.join(output, 'report.json'))
    ? JSON.parse(fs.readFileSync(path.join(output, 'report.json')))
    : null
  const actual = actualRaw && normalize(actualRaw, fixture),
    expected = reference.standardReport
  save('COMPARISON.json', {
    status: owner.status,
    completeRowsEqual: actualRows === expectedRows,
    completeStandardReportEqual:
      JSON.stringify(actual) === JSON.stringify(expected),
    actual,
    expected,
  })
  assert.equal(owner.status, 0, owner.stderr)
  assert.equal(
    actualRows,
    expectedRows,
    'Every complete authored row must match'
  )
  assert.deepEqual(
    actual,
    expected,
    'Complete standard JSON report must match, excluding only actual timing, concrete fixture path and the additive Next event envelope'
  )
  passed = true
  save('RESULT.json', {
    passed,
    engine,
    mode,
    cases: actualRaw.numPassedTests,
    completeAuthoredRows: actualRows.trim().split('\n').length,
    completeStandardReportEqual: true,
    originalSourceExact:
      sha(fs.readFileSync(path.join(fixture, 'require.test.mjs'))) ===
      sha(source),
  })
  console.log(
    JSON.stringify({ passed, engine, mode, cases: actualRaw.numPassedTests })
  )
} finally {
  if (joined) {
    assert.equal(
      sha(fs.readFileSync(path.join(fixture, 'require.test.mjs'))),
      sha(source)
    )
    fs.rmSync(fixture, { recursive: true, force: true })
  }
  save('CLOSED.json', {
    passed,
    strictOwnerJoined: joined,
    fixtureRemoved: !fs.existsSync(fixture),
  })
}
