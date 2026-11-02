import fs from 'node:fs'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg, variant] = process.argv.slice(2)
assert(consumerArg && outputArg && variant)
const consumer = fs.realpathSync(consumerArg)
const output = path.resolve(outputArg)
const directory = path.dirname(fileURLToPath(import.meta.url))
const engine = process.versions.node.split('.')[0]
const corpus = JSON.parse(
  fs.readFileSync(path.join(directory, 'reference.json'), 'utf8')
)
assert.equal(corpus.referenceVersion, '5.0.4')
const contract = corpus.variants[variant]
assert(contract)
const genuine = contract.models[engine]
assert(genuine, 'Requires a measured genuine Node engine')
assert(!fs.existsSync(output))
fs.mkdirSync(output, { recursive: true })
const save = (name, value) =>
  fs.writeFileSync(
    path.join(output, name),
    JSON.stringify(value, null, 2) + '\n'
  )
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const load = createRequire(path.join(consumer, 'package.json'))
if (!process.argv.includes('--source'))
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const fixture = fs.mkdtempSync(path.join(consumer, '.next-cjs-composition-'))
let joined = false
try {
  for (const [name, hash] of Object.entries(contract.files)) {
    const bytes = fs.readFileSync(
      path.join(directory, 'fixtures', variant, name + '.txt')
    )
    assert.equal(sha(bytes), hash)
    fs.writeFileSync(path.join(fixture, name), bytes)
    fs.writeFileSync(path.join(output, name), bytes)
  }
  fs.writeFileSync(path.join(fixture, 'package.json'), '{"type":"module"}\n')
  fs.writeFileSync(
    path.join(fixture, 'vitest.config.mjs'),
    'export default ' +
      JSON.stringify({
        test: { include: ['contract.case.mjs'], maxWorkers: 1 },
      }) +
      '\n'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  const env = {
    ...process.env,
    CI: '1',
    FORCE_COLOR: '0',
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    NEXT_REQUIRE_EVENTS: path.join(fixture, 'events.jsonl'),
    NEXT_REQUIRE_ROWS: path.join(fixture, 'rows.jsonl'),
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
      '--outputFile=' + path.join(fixture, 'cases.json'),
    ],
    {
      cwd: fixture,
      env,
      auditDir: path.join(output, 'owners'),
      timeoutMs: 120000,
    }
  )
  save('OWNER.json', owner)
  fs.writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(
    owner,
    'actual original CommonJS require and ESM factory composition'
  )
  joined = true
  for (const name of ['rows.jsonl', 'events.jsonl', 'cases.json'])
    if (fs.existsSync(path.join(fixture, name)))
      fs.copyFileSync(path.join(fixture, name), path.join(output, name))
  const keys = [
    'ancestorTitles',
    'fullName',
    'status',
    'title',
    'failureMessages',
    'meta',
    'tags',
    'benchmarks',
  ]
  const report = JSON.parse(
    fs.readFileSync(path.join(output, 'cases.json'), 'utf8')
  )
  const actual = {
    row: JSON.parse(
      fs.readFileSync(path.join(output, 'rows.jsonl'), 'utf8').trim()
    ),
    events: fs
      .readFileSync(path.join(output, 'events.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
    cases: {
      counts: Object.fromEntries(
        Object.entries(report).filter(([key]) => key.startsWith('num'))
      ),
      success: report.success,
      files: report.testResults.map((file) => ({
        file: path.basename(file.name),
        status: file.status,
        message: file.message,
        cases: file.assertionResults.map((test) =>
          Object.fromEntries(
            keys
              .filter((key) => Object.hasOwn(test, key))
              .map((key) => [key, test[key]])
          )
        ),
      })),
    },
  }
  save('ACTUAL.json', actual)
  assert.equal(owner.status, 0)
  assert.deepEqual(actual.row, genuine.row)
  assert.deepEqual(actual.events, genuine.events)
  assert.deepEqual(actual.cases, genuine.cases)
  for (const [name, hash] of Object.entries(contract.files))
    assert.equal(sha(fs.readFileSync(path.join(fixture, name))), hash)
  save('RESULT.json', {
    passed: true,
    variant,
    engine,
    cases: report.numPassedTests,
    wholeAuthoredRowExact: true,
    wholeRequireEventsExact: true,
    semanticCaseFieldsExact: true,
    authoredSourceBytesExact: true,
  })
} finally {
  if (joined) fs.rmSync(fixture, { recursive: true, force: true })
  save('CLOSED.json', {
    allActualProcessesJoined: joined,
    fixtureRetired: !fs.existsSync(fixture),
  })
}
