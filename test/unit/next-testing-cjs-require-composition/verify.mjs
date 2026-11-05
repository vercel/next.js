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
import { resolveFixturePath } from '../../lib/next-testing-fixtures.cjs'

const [consumerArg, outputArg, variant] = process.argv.slice(2)
assert(consumerArg && outputArg && variant)
const consumer = fs.realpathSync(consumerArg)
const output = path.resolve(outputArg)
const directory = path.dirname(fileURLToPath(import.meta.url))
const engine = process.versions.node.split('.')[0]
const corpus = JSON.parse(
  fs.readFileSync(
    resolveFixturePath(path.join(directory, 'reference.json')),
    'utf8'
  )
)
assert.equal(corpus.referenceVersion, '5.0.4')
const contract = corpus.variants[variant]
assert(contract)
if (contract.completeModel) {
  await verifyRetainedReset()
  process.exit(0)
}
const mode = contract.mode ?? 'development'
assert(['development', 'production'].includes(mode))
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
      resolveFixturePath(
        path.join(directory, 'fixtures', variant, name + '.txt')
      )
    )
    assert.equal(sha(bytes), hash)
    fs.writeFileSync(path.join(fixture, name), bytes)
    fs.writeFileSync(path.join(output, name), bytes)
  }
  fs.writeFileSync(path.join(fixture, 'package.json'), '{"type":"module"}\n')
  fs.writeFileSync(
    path.join(fixture, 'vitest.config.mjs'),
    'export default ' +
      JSON.stringify(
        mode === 'production'
          ? {
              test: {
                projects: [
                  {
                    test: {
                      name: 'production',
                      mode,
                      include: ['contract.case.mjs'],
                    },
                  },
                ],
                maxWorkers: 1,
              },
            }
          : { test: { include: ['contract.case.mjs'], maxWorkers: 1 } }
      ) +
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
    NODE_ENV: mode,
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
  const started = report.next.events.filter(
    (event) => event.type === 'file-start'
  )
  assert.equal(started.length, 1)
  assert.equal(started[0].entry.profile.mode, mode)
  assert.equal(started[0].entry.profile.environment, 'node')
  assert.equal(started[0].entry.profile.runtime, 'nodejs')
  const actual = {
    row: contract.multipleRows
      ? fs
          .readFileSync(path.join(output, 'rows.jsonl'), 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : JSON.parse(
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

async function verifyRetainedReset() {
  assert.equal(contract.mode, 'development')
  assert.equal(contract.engines[engine], process.version)
  assert.deepEqual(contract.bounds, { cli: 120000, test: 5000, hook: 5000 })
  assert(!fs.existsSync(output))
  fs.mkdirSync(output, { recursive: true })
  const saveComplete = (name, value) =>
    fs.writeFileSync(
      path.join(output, name),
      JSON.stringify(value, null, 2) + '\n'
    )
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
  const requireConsumer = createRequire(path.join(consumer, 'package.json'))
  const source = process.argv.includes('--source')
  if (!source)
    for (const name of ['vitest', 'vite', '@vitest/mocker'])
      assert.throws(() => requireConsumer.resolve(name))
  const nextRoot = source
    ? fs.realpathSync(path.join(consumer, 'packages/next'))
    : fs.realpathSync(
        path.dirname(requireConsumer.resolve('next/package.json'))
      )
  assert(nextRoot.startsWith(consumer + path.sep))
  const requireNext = createRequire(path.join(nextRoot, 'package.json'))
  const nextBin = source
    ? path.join(nextRoot, 'dist/bin/next')
    : requireNext.resolve('next/dist/bin/next')
  assert.equal(
    fs.realpathSync(nextBin),
    fs.realpathSync(path.join(nextRoot, 'dist/bin/next'))
  )
  const actualFixture = fs.mkdtempSync(
    path.join(consumer, '.next-retained-cjs-reset-')
  )
  assert.equal(path.dirname(fs.realpathSync(actualFixture)), consumer)
  let completeJoined = false
  try {
    for (const [name, expectedHash] of Object.entries(contract.files)) {
      const bytes = fs.readFileSync(
        resolveFixturePath(
          path.join(directory, 'fixtures', variant, name + '.txt')
        )
      )
      assert.equal(hash(bytes), expectedHash, name)
      fs.writeFileSync(path.join(actualFixture, name), bytes)
      fs.writeFileSync(path.join(output, name), bytes)
    }
    const reporter = fs.readFileSync(
      resolveFixturePath(
        path.join(directory, 'fixtures', variant, 'reporter.mjs.txt')
      )
    )
    assert.equal(hash(reporter), contract.reporterSHA256)
    fs.writeFileSync(path.join(actualFixture, 'reporter.mjs'), reporter)
    fs.writeFileSync(
      path.join(actualFixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    const config = {
      projects: [
        {
          name: variant,
          mode: 'development',
          environment: 'node',
          include: ['contract.case.mjs'],
          testTimeout: contract.bounds.test,
          hookTimeout: contract.bounds.hook,
          includeTaskLocation: false,
        },
      ],
      fileParallelism: false,
      maxWorkers: 1,
    }
    fs.writeFileSync(
      path.join(actualFixture, 'next.test.config.json'),
      JSON.stringify(config) + '\n'
    )
    for (const name of ['rows.jsonl', 'events.jsonl', 'callbacks.jsonl'])
      fs.writeFileSync(path.join(actualFixture, name), '')
    const env = {
      ...process.env,
      CI: '1',
      FORCE_COLOR: '0',
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
      NEXT_REQUIRE_ROWS: path.join(actualFixture, 'rows.jsonl'),
      NEXT_REQUIRE_EVENTS: path.join(actualFixture, 'events.jsonl'),
      NEXT_REQUIRE_CALLBACKS: path.join(actualFixture, 'callbacks.jsonl'),
    }
    for (const key of [
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[key]
    saveComplete('INPUTS.json', {
      kind: source ? 'source' : 'installed',
      consumer,
      nextRoot,
      nextBin: fs.realpathSync(nextBin),
      mode: 'development',
      variant,
      actualNodeVersion: process.version,
      config,
      bounds: contract.bounds,
      sourceSHA256: contract.files,
    })
    const owner = await runOwnedNode(
      [
        nextBin,
        'test',
        actualFixture,
        '--run',
        '--reporter=json',
        '--reporter=' + path.join(actualFixture, 'reporter.mjs'),
        '--outputFile=' + path.join(actualFixture, 'cases.json'),
      ],
      {
        cwd: actualFixture,
        env,
        auditDir: path.join(output, 'owners'),
        timeoutMs: contract.bounds.cli,
      }
    )
    saveComplete('OWNER.json', owner)
    fs.writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
    fs.writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(
      owner,
      'retained reset reference with original CommonJS require'
    )
    completeJoined = true
    for (const name of [
      'rows.jsonl',
      'events.jsonl',
      'callbacks.jsonl',
      'cases.json',
    ])
      fs.copyFileSync(path.join(actualFixture, name), path.join(output, name))
    const lines = (name) =>
      fs
        .readFileSync(path.join(output, name), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    const report = JSON.parse(
      fs.readFileSync(path.join(output, 'cases.json'), 'utf8')
    )
    const actualRows = lines('rows.jsonl')
    const requireEvents = lines('events.jsonl')
    const normalizeEntity = (entity) => ({
      ...entity,
      moduleId: path.basename(entity.moduleId),
    })
    const callbacks = lines('callbacks.jsonl').map((row) => {
      if (row.hook === 'onUserConsoleLog') {
        const { time, taskId, ...log } = row.log
        return { ...row, log }
      }
      if (row.module) return { ...row, module: normalizeEntity(row.module) }
      if (row.test) return { ...row, test: normalizeEntity(row.test) }
      if (row.modules)
        return { ...row, modules: row.modules.map(normalizeEntity) }
      if (row.specifications)
        return {
          ...row,
          specifications: row.specifications.map(normalizeEntity),
        }
      return row
    })
    const { next, startTime, ...standardFields } = report
    const actualComplete = {
      status: owner.status,
      cases: report.testResults.flatMap((file) =>
        file.assertionResults.map(({ duration, ...test }) => test)
      ),
      standardReport: {
        ...standardFields,
        testResults: report.testResults.map(
          ({ startTime, endTime, name, assertionResults, ...file }) => ({
            ...file,
            name: path.basename(name),
            assertionResults: assertionResults.map(
              ({ duration, ...test }) => test
            ),
          })
        ),
      },
      rows: actualRows,
      events: requireEvents,
      eventCounts: Object.fromEntries(
        [...new Set(requireEvents.map((event) => event.name))].map((name) => [
          name,
          requireEvents.filter((event) => event.name === name).length,
        ])
      ),
      callbacks,
    }
    saveComplete('ACTUAL.json', actualComplete)
    saveComplete('NEXT-ENVELOPE.json', next)
    assert.equal(owner.status, 0)
    assert.deepEqual(actualComplete, contract.expected)
    assert.equal(report.numPassedTests, contract.cases)
    assert.equal(actualRows.length, contract.rows)
    assert.equal(callbacks.length, contract.callbacks)
    const starts = next.events.filter((event) => event.type === 'file-start')
    assert.equal(starts.length, 1)
    assert.equal(starts[0].entry.profile.mode, 'development')
    assert.equal(starts[0].entry.profile.environment, 'node')
    assert.equal(starts[0].entry.profile.runtime, 'nodejs')
    for (const [name, expectedHash] of Object.entries(contract.files))
      assert.equal(
        hash(fs.readFileSync(path.join(actualFixture, name))),
        expectedHash,
        name
      )
    saveComplete('RESULT.json', {
      passed: true,
      variant,
      engine,
      actualNodeVersion: process.version,
      mode: 'development',
      cases: report.numPassedTests,
      wholeAuthoredRowExact: true,
      wholeRequireEventsExact: true,
      semanticCaseFieldsExact: true,
      authoredSourceBytesExact: true,
      completeStandardReportExact: true,
      completeReporterCallbacksExact: true,
    })
  } finally {
    if (completeJoined)
      fs.rmSync(actualFixture, { recursive: true, force: true })
    saveComplete('CLOSED.json', {
      allActualProcessesJoined: completeJoined,
      fixtureRetired: !fs.existsSync(actualFixture),
    })
  }
}
