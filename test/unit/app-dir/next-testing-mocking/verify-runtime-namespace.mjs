import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const [consumerArg, outputArg, kindArg = '--source'] = process.argv.slice(2)
assert(consumerArg && outputArg)
assert(['--source', '--installed'].includes(kindArg))
const consumer = fs.realpathSync(consumerArg)
const output = path.resolve(outputArg)
assert(!fs.existsSync(output), 'Requires an unused output directory')
const reference = JSON.parse(
  fs.readFileSync(path.join(here, 'runtime-namespace-reference.json'), 'utf8')
)
const expected = reference.models[process.versions.node.split('.')[0]]
assert(expected, 'Requires a measured Node engine')
assert.equal(expected.actualNode, process.version)
const sha = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const load = createRequire(path.join(consumer, 'package.json'))
const nextRoot = path.dirname(
  fs.realpathSync(load.resolve('next/package.json'))
)
const nextCLI = fs.realpathSync(load.resolve('next/dist/bin/next'))
assert(nextRoot.startsWith(consumer + path.sep))
assert(nextCLI.startsWith(nextRoot + path.sep))
if (kindArg === '--source')
  assert.equal(nextRoot, fs.realpathSync(path.join(consumer, 'packages/next')))
const swc = createRequire(load.resolve('next/dist/build/swc'))
const triples =
  load('next/dist/build/swc').getSupportedArchTriples()[process.platform]?.[
    process.arch
  ] ?? []
const nativeRequests = [
  ...triples.map(
    (triple) => `@next/swc/native/next-swc.${triple.platformArchABI}.node`
  ),
  ...triples.map((triple) => `@next/swc-${triple.platformArchABI}`),
]
let native
for (const request of nativeRequests) {
  try {
    native = swc.resolve(request)
    break
  } catch (error) {
    assert.equal(error.code, 'MODULE_NOT_FOUND')
  }
}
assert(
  native,
  'Requires an available native binding for the actual host platform'
)
native = fs.realpathSync(native)
assert(native.startsWith(consumer + path.sep))
const identity = () => ({
  nextRoot,
  nextCLI,
  nextCLISHA256: sha(nextCLI),
  native,
  nativeSHA256: sha(native),
  nativeInode: fs.statSync(native).ino,
  nativeLinks: fs.statSync(native).nlink,
  actualNode: process.version,
})
const before = identity()
assert.equal(before.nativeLinks, 1)
fs.mkdirSync(output, { recursive: true })
const save = (name, value) =>
  fs.writeFileSync(
    path.join(output, name),
    JSON.stringify(value, null, 2) + '\n'
  )
save('IDENTITY-BEFORE.json', before)
const fixture = fs.mkdtempSync(
  path.join(consumer, '.next-test-runtime-namespace-')
)
let joined = false
try {
  for (const [name, hash] of Object.entries(reference.files)) {
    const source = path.join(here, 'runtime-namespace-fixtures', name + '.txt')
    assert.equal(sha(source), hash)
    fs.copyFileSync(source, path.join(fixture, name))
    fs.copyFileSync(source, path.join(output, name))
  }
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }) + '\n'
  )
  fs.writeFileSync(path.join(output, 'rows.jsonl'), '')
  const config = {
    projects: [
      {
        name: 'runtime-factory-namespace',
        mode: 'development',
        environment: 'node',
        isolate: true,
        include: ['admitted.case.mjs', 'alias.case.mjs'],
        testTimeout: 5000,
        hookTimeout: 5000,
        includeTaskLocation: false,
      },
    ],
    maxWorkers: 1,
    fileParallelism: false,
  }
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.test.config.json'),
    JSON.stringify(config) + '\n'
  )
  const args = [
    nextCLI,
    'test',
    fixture,
    '--run',
    '--reporter=default',
    '--reporter=json',
    '--outputFile=' + path.join(output, 'report.json'),
  ]
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    FORCE_COLOR: '0',
    NEXT_MOCK_ROWS: path.join(output, 'rows.jsonl'),
  }
  for (const key of [
    'CI',
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[key]
  const supervisor = path.resolve(
    here,
    '../../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
  )
  const { runOwnedNode, assertOwnedNodeCompleted } = await import(
    pathToFileURL(supervisor).href
  )
  save('INPUTS.json', {
    consumer,
    fixture,
    args,
    config,
    bounds: reference.bounds,
    actualNode: process.version,
    actualExecutable: process.execPath,
    sourceSHA256: reference.files,
    identity: before,
  })
  const owner = await runOwnedNode(args, {
    cwd: fixture,
    env,
    auditDir: path.join(output, 'owners'),
    timeoutMs: reference.bounds.cli,
  })
  save('OWNER.json', owner)
  fs.writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner)
  joined = true
  const report = JSON.parse(fs.readFileSync(path.join(output, 'report.json')))
  const rows = fs
    .readFileSync(path.join(output, 'rows.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse)
  const { next, startTime, ...standard } = report
  standard.testResults = report.testResults.map(
    ({ startTime, endTime, name, assertionResults, ...file }) => ({
      ...file,
      name: path.basename(name),
      assertionResults: assertionResults.map(({ duration, ...test }) => test),
    })
  )
  const actual = { status: owner.status, standardReport: standard, rows }
  save('ACTUAL.json', actual)
  assert.deepEqual(actual, {
    status: expected.status,
    standardReport: expected.standardReport,
    rows: expected.rows,
  })
  for (const [name, hash] of Object.entries(reference.files))
    assert.equal(sha(path.join(fixture, name)), hash)
  const after = identity()
  save('IDENTITY-AFTER.json', after)
  assert.deepEqual(after, before)
  const result = {
    passed: true,
    cases: report.numTotalTests,
    rows: rows.length,
    completeStandardReportExact: true,
    completeRowsExact: true,
    sourceBytesExact: true,
    actualNode: process.version,
  }
  save('RESULT.json', result)
  console.log(JSON.stringify(result))
} finally {
  if (joined) fs.rmSync(fixture, { recursive: true })
  save('CLOSED.json', {
    allActualProcessesJoined: joined,
    fixtureRetired: !fs.existsSync(fixture),
  })
}
