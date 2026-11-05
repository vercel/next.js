import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolveFixturePath } from '../../lib/next-testing-fixtures.cjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const corpus = JSON.parse(
  fs.readFileSync(
    resolveFixturePath(path.join(here, 'module-reset-property-pristine.json')),
    'utf8'
  )
)
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
assert.equal(corpus.referenceVersion, '5.0.4')
assert.deepEqual(corpus.bounds, { cli: 120000, test: 5000, hook: 5000 })
for (const [variant, entry] of Object.entries(corpus.variants)) {
  for (const [name, hash] of Object.entries(entry.files)) {
    assert.equal(
      sha(
        fs.readFileSync(
          resolveFixturePath(
            path.join(
              here,
              'module-reset-property-fixtures',
              variant,
              name + '.txt'
            )
          )
        )
      ),
      hash,
      variant + '/' + name
    )
  }
}
if (process.argv[2] === '--check-corpus') {
  console.log(
    JSON.stringify({
      referenceVersion: corpus.referenceVersion,
      variants: Object.keys(corpus.variants),
      authoredSourcesExact: true,
      cases: Object.values(corpus.variants).map((entry) => entry.cases),
      rows: Object.values(corpus.variants).map((entry) => entry.rows),
      callbacks: Object.values(corpus.variants).map((entry) => entry.callbacks),
      bounds: corpus.bounds,
    })
  )
  process.exit(0)
}

const { runOwnedNode, assertOwnedNodeCompleted } = await import(
  '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
)

assert.equal(process.argv.slice(2).length, 5, 'Requires five replay arguments')
const [consumerArg, outputArg, mode, variant, kind] = process.argv.slice(2)
assert(consumerArg && outputArg)
assert(['development', 'production'].includes(mode))
assert(['source', 'installed'].includes(kind))
const consumer = fs.realpathSync(consumerArg)
const output = path.resolve(outputArg)
const engine = process.versions.node.split('.')[0]
assert.match(
  corpus.engines['20']?.[mode],
  /^v20\./,
  'Requires the retained genuine Node 20 reference for this mode'
)
const contract = corpus.variants[variant]
assert(contract, 'Unknown reset property fixture')
const expected = contract.expectedByMode?.[mode] ?? contract.expected
assert(expected, 'Requires the measured complete model for this mode')
assert(!fs.existsSync(output), 'Requires an unused owned output directory')
const load = createRequire(path.join(consumer, 'package.json'))
if (kind === 'installed') {
  for (const name of ['vitest', 'vite', '@vitest/mocker']) {
    assert.throws(() => load.resolve(name))
  }
}
const nextRoot =
  kind === 'source'
    ? fs.realpathSync(path.join(consumer, 'packages/next'))
    : fs.realpathSync(path.dirname(load.resolve('next/package.json')))
const nextLoad = createRequire(path.join(nextRoot, 'package.json'))
const nextBin =
  kind === 'source'
    ? path.join(nextRoot, 'dist/bin/next')
    : nextLoad.resolve('next/dist/bin/next')
assert(
  nextRoot.startsWith(consumer + path.sep),
  'Requires the actual consumer Next package'
)
assert.equal(
  fs.realpathSync(nextBin),
  fs.realpathSync(path.join(nextRoot, 'dist/bin/next')),
  'Requires the selected Next package CLI without a Root fallback'
)
fs.mkdirSync(output, { recursive: true })
const save = (name, value) =>
  fs.writeFileSync(
    path.join(output, name),
    JSON.stringify(value, null, 2) + '\n'
  )
const fixture = fs.mkdtempSync(path.join(consumer, '.next-reset-property-'))
assert.equal(path.dirname(fs.realpathSync(fixture)), consumer)
let joined = false
try {
  for (const [name, hash] of Object.entries(contract.files)) {
    const bytes = fs.readFileSync(
      resolveFixturePath(
        path.join(
          here,
          'module-reset-property-fixtures',
          variant,
          name + '.txt'
        )
      )
    )
    assert.equal(sha(bytes), hash)
    fs.writeFileSync(path.join(fixture, name), bytes)
    fs.writeFileSync(path.join(output, name), bytes)
  }
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    '{"type":"module","private":true}\n'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.test.config.json'),
    JSON.stringify({
      projects: [
        {
          name: 'reset-utility-' + variant,
          mode,
          environment: 'node',
          include: ['suite.test.mjs'],
          testTimeout: corpus.bounds.test,
          hookTimeout: corpus.bounds.hook,
          includeTaskLocation: false,
        },
      ],
      fileParallelism: false,
      maxWorkers: 1,
    }) + '\n'
  )
  const reporter = `import fs from 'node:fs'
export default class {
  onUserConsoleLog(log) {
    fs.appendFileSync(process.env.RESET_UTILITY_LOG, JSON.stringify({ hook: 'console', log }) + '\\n')
  }
  onTestRunEnd(modules, errors, reason) {
    fs.appendFileSync(process.env.RESET_UTILITY_LOG, JSON.stringify({
      hook: 'end', reason,
      errors: errors.map(error => ({ name: error.name, message: error.message })),
      modules: modules.map(module => ({ state: module.state(), errors: module.errors() })),
    }) + '\\n')
  }
}
`
  fs.writeFileSync(path.join(fixture, 'reporter.mjs'), reporter)
  fs.writeFileSync(path.join(output, 'console.jsonl'), '')
  const env = {
    ...process.env,
    NODE_ENV: mode,
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    FORCE_COLOR: '0',
    RESET_UTILITY_LOG: path.join(output, 'console.jsonl'),
    RESET_LITERAL_EVENTS: path.join(fixture, 'events.jsonl'),
    RESET_EXPECTED_MODE: mode,
  }
  for (const name of [
    'CI',
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[name]
  save('INPUTS.json', {
    kind,
    consumer,
    nextRoot,
    nextBin: fs.realpathSync(nextBin),
    mode,
    variant,
    actualNodeVersion: process.version,
    sourceSHA256: contract.files,
    bounds: corpus.bounds,
    executionEventFile: env.RESET_LITERAL_EVENTS,
  })
  const owner = await runOwnedNode(
    [
      nextBin,
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--reporter=' + path.join(fixture, 'reporter.mjs'),
      '--outputFile=' + path.join(output, 'report.json'),
    ],
    {
      cwd: fixture,
      env,
      auditDir: path.join(output, 'owners'),
      timeoutMs: corpus.bounds.cli,
    }
  )
  save('OWNER.json', owner)
  fs.writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(
    owner,
    'public reset property descriptors and cache ownership'
  )
  joined = true
  const report = JSON.parse(
    fs.readFileSync(path.join(output, 'report.json'), 'utf8')
  )
  const logs = fs
    .readFileSync(path.join(output, 'console.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const { next, startTime, ...reportFields } = report
  const eventFile = path.join(fixture, 'events.jsonl')
  const executionEvents = fs.existsSync(eventFile)
    ? fs
        .readFileSync(eventFile, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : null
  if (contract.executionEvents === 'file') {
    assert.notEqual(executionEvents, null, 'Requires authored execution events')
    fs.copyFileSync(eventFile, path.join(output, 'events.jsonl'))
  } else {
    assert.equal(
      executionEvents,
      null,
      'Original V2 does not author an event file'
    )
  }
  const actual = {
    status: owner.status,
    events: logs.map((row) =>
      row.hook === 'console'
        ? {
            ...row,
            log: Object.fromEntries(
              Object.entries(row.log).filter(
                ([key]) => key !== 'time' && key !== 'taskId'
              )
            ),
          }
        : row
    ),
    rows: logs
      .filter((row) => row.hook === 'console')
      .flatMap((row) =>
        row.log.content
          .split('\n')
          .filter((line) => line.startsWith('RESET_UTILITY_ROW '))
          .map((line) => JSON.parse(line.slice('RESET_UTILITY_ROW '.length)))
      ),
    cases: report.testResults.flatMap((file) =>
      file.assertionResults.map((test) => ({
        name: test.fullName,
        state: test.status,
      }))
    ),
    summary: Object.fromEntries(
      Object.entries(report).filter(
        ([key]) => key.startsWith('num') || key === 'success'
      )
    ),
    terminal: logs.filter((row) => row.hook === 'end'),
    standardReport: {
      ...reportFields,
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
  }
  actual.executionEvents = executionEvents
  save('ACTUAL.json', actual)
  save('NEXT-ENVELOPE.json', next)
  assert.equal(owner.status, 0)
  assert.deepEqual(actual, expected)
  const started = next.events.filter((event) => event.type === 'file-start')
  assert.equal(started.length, 1)
  assert.equal(started[0].entry.profile.mode, mode)
  assert.equal(started[0].entry.profile.environment, 'node')
  assert.equal(started[0].entry.profile.runtime, 'nodejs')
  for (const [name, hash] of Object.entries(contract.files)) {
    assert.equal(sha(fs.readFileSync(path.join(fixture, name))), hash)
  }
  save('CHECKS.json', {
    passed: true,
    kind,
    engine,
    actualNodeVersion: process.version,
    mode,
    variant,
    cases: contract.cases,
    rows: contract.rows,
    callbacks: contract.callbacks,
    completeStandardReportExact: true,
    completeReporterCallbacksExact: true,
    completeRowsAndTerminalExact: true,
    completeExecutionEventsExact: true,
    allAuthoredBytesHeld: true,
    allOwnersJoined: true,
  })
} finally {
  if (joined) fs.rmSync(fixture, { recursive: true, force: true })
  save('CLOSED.json', {
    allActualProcessesJoined: joined,
    fixtureRetired: !fs.existsSync(fixture),
  })
}
