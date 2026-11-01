import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import {
  assertOwnedNodeCompleted,
  runOwnedNode,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify.mjs <consumer-root> <new-output>'
)
const consumer = realpathSync(consumerArg)
const output = path.resolve(outputArg)
mkdirSync(output)
const load = createRequire(path.join(consumer, 'package.json'))
const bin = load.resolve('next/dist/bin/next')
const reference = JSON.parse(
  readFileSync(new URL('./reference.json', import.meta.url), 'utf8')
)
const sha = (value) => createHash('sha256').update(value).digest('hex')
const save = (file, value) =>
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
const authored = { 'package.json': '{"private":true,"type":"module"}\n' }
for (const [name, hash] of Object.entries(reference.fixtureSHA256)) {
  const body = readFileSync(
    new URL('./fixtures/' + name + '.txt', import.meta.url)
  )
  assert.equal(sha(body), hash, 'Changed authored fixture: ' + name)
  authored[name] = body
}
// Only the actual fixture coordinate and measured timing fields differ between
// independent processes. Preserve every other reference field, including arrays.
// Check the retained Next-only envelope independently before this comparison.
function checkNextEvidence(report, api) {
  const next = report.next
  assert(next && typeof next === 'object')
  assert.deepEqual(Object.keys(next).sort(), ['events', 'summary', 'version'])
  assert.equal(next.version, 1)
  assert.equal(next.summary.runId, api.run.id)
  assert.equal(next.summary.status, api.run.status)
  assert.deepEqual(next.summary.files, {
    passed: report.numPassedTestSuites,
    failed: report.numFailedTestSuites,
    skipped: report.numPendingTestSuites,
    cancelled: 0,
  })
  const cases = {
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    skipped: report.numPendingTests + report.numTodoTests,
    cancelled: 0,
  }
  assert.deepEqual(next.summary.cases, cases)
  // Every unchanged corpus case has one attempt and no error or attachment.
  assert.deepEqual(next.summary.attempts, cases)
  assert.equal(next.summary.errors, 0)
  assert.equal(next.summary.warnings, 0)
  assert.equal(next.summary.attachments, 0)
  assert(Array.isArray(next.events))
  for (const event of next.events) {
    assert.equal(event.version, 1)
    assert.equal(event.runId, api.run.id)
    assert(Number.isFinite(event.timestamp))
  }
  const starts = next.events.filter((event) => event.type === 'run-start')
  const ends = next.events.filter((event) => event.type === 'run-end')
  assert.equal(starts.length, 1)
  assert.equal(ends.length, 1)
  assert.equal(ends[0].status, api.run.status)
}
function stableReport(report, fixture) {
  const { startTime: _start, next: _next, ...run } = report
  return {
    ...run,
    testResults: report.testResults.map((result) => {
      const {
        name,
        startTime: _start,
        endTime: _end,
        assertionResults,
        ...file
      } = result
      return {
        ...file,
        name: path.relative(fixture, name).replaceAll('\\', '/'),
        assertionResults: assertionResults.map((result) => {
          const { duration: _duration, ...assertion } = result
          return assertion
        }),
      }
    }),
  }
}
const reservation = createServer()
await new Promise((resolve, reject) => {
  reservation.once('error', reject)
  reservation.listen(0, '127.0.0.1', resolve)
})
const address = reservation.address()
assert(address && typeof address === 'object')
const port = address.port
await new Promise((resolve, reject) =>
  reservation.close((error) => (error ? reject(error) : resolve()))
)
const fixture = path.join(consumer, '.next-test-watch-triggers-' + randomUUID())
mkdirSync(fixture)
symlinkSync(
  path.join(consumer, 'node_modules'),
  path.join(fixture, 'node_modules'),
  'dir'
)
for (const [name, body] of Object.entries(authored)) {
  mkdirSync(path.dirname(path.join(fixture, name)), { recursive: true })
  writeFileSync(path.join(fixture, name), body)
}
writeFileSync(
  path.join(fixture, 'next.config.mjs'),
  'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
)
const reportPath = path.join(fixture, 'result.json')
const tracePath = path.join(output, 'mapper.jsonl')
const env = Object.fromEntries(
  ['HOME', 'PATH', 'TMPDIR', 'LANG', 'SHELL']
    .filter((name) => process.env[name] !== undefined)
    .map((name) => [name, process.env[name]])
)
Object.assign(env, {
  NODE_ENV: 'development',
  NEXT_TELEMETRY_DISABLED: '1',
  FORCE_COLOR: '0',
  CI: '1',
  NEXT_TEST_TRIGGER_TRACE: tracePath,
})
const args = [
  bin,
  'test',
  fixture,
  '--api',
  String(port),
  '--reporter',
  'default',
  '--reporter',
  'json',
  '--outputFile',
  'result.json',
]
const pinFiles = [
  'bin/next',
  'experimental/testing/config-worker.js',
  'experimental/testing/config-watch-triggers.js',
  'experimental/testing/config-modules.js',
  'experimental/testing/config.js',
  'experimental/testing/watch-orchestrator.js',
  'experimental/testing/incremental/watch-session.js',
  'experimental/testing/incremental/watch-trigger-selection.js',
]
const productPins = () =>
  Object.fromEntries(
    pinFiles.map((name) => {
      const file = load.resolve('next/dist/' + name)
      return [realpathSync(file), sha(readFileSync(file))]
    })
  )
const before = productPins()
save(path.join(output, 'INPUTS.json'), {
  runtime: process.version,
  executable: realpathSync(process.execPath),
  consumer,
  fixture,
  args,
  port,
  envNames: Object.keys(env),
  authoredSHA256: Object.fromEntries(
    Object.entries(authored).map(([name, body]) => [name, sha(body)])
  ),
  productPins: before,
  initialBudgetMs: 60000,
  rerunBudgetMs: 30000,
  ownerBudgetMs: 180000,
  scope:
    'Five actual development watch generations (including an actual failed zero-test requested selection) across two inline projects. Default Next watcher, explicit private polling only in genuine reference. Dynamic config edits, external-project retention and mapper Promise/error transport remain separate.',
})
let done, owner, failure, priorRun, priorReport
let productPinsHeld = false
let allOwnedProcessesJoined = false
const running = runOwnedNode(args, {
  cwd: fixture,
  env,
  auditDir: path.join(output, 'owners'),
  timeoutMs: 180000,
}).then((value) => (done = value))
const mapperRows = () =>
  existsSync(tracePath)
    ? readFileSync(tracePath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse)
    : []
async function observe(index) {
  const deadline = Date.now() + (index === 1 ? 60000 : 30000)
  let api, report, bytes
  while (Date.now() < deadline) {
    assert(!done, 'Next watch exited before generation ' + index)
    try {
      const response = await fetch(
        'http://127.0.0.1:' + port + '/v1/discovery',
        { signal: AbortSignal.timeout(1000) }
      )
      if (response.ok) api = await response.json()
    } catch (error) {
      if (
        error.name !== 'TimeoutError' &&
        error.cause?.code !== 'ECONNREFUSED' &&
        error.cause?.code !== 'ECONNRESET'
      )
        throw error
    }
    if (existsSync(reportPath)) {
      bytes = readFileSync(reportPath)
      try {
        report = JSON.parse(bytes)
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error
      }
    }
    if (
      api?.run &&
      api.run.id !== priorRun &&
      api.run.status !== 'running' &&
      report &&
      sha(bytes) !== priorReport
    )
      break
    await delay(50)
  }
  save(path.join(output, 'API-' + index + '.json'), api ?? null)
  if (report) save(path.join(output, 'REPORT-' + index + '.json'), report)
  assert(
    api?.run &&
      api.run.id !== priorRun &&
      api.run.status !== 'running' &&
      report &&
      sha(bytes) !== priorReport,
    'Actual settled report missing by generation deadline: ' + index
  )
  priorRun = api.run.id
  priorReport = sha(bytes)
  assert.equal(
    api.run.status,
    reference.reports[index - 1].success ? 'passed' : 'failed'
  )
  checkNextEvidence(report, api)
  assert.deepEqual(stableReport(report, fixture), reference.reports[index - 1])
}
try {
  await observe(1)
  writeFileSync(
    path.join(fixture, 'trigger/alpha.payload.mjs'),
    "export const payload='payload-1'\n"
  )
  await observe(2)
  writeFileSync(
    path.join(fixture, 'trigger/both.payload.mjs'),
    "export const payload='payload-both-1'\n"
  )
  await observe(3)
  writeFileSync(
    path.join(fixture, 'shared.mjs'),
    "export const value='shared-1'\n"
  )
  await observe(4)
  writeFileSync(
    path.join(fixture, 'trigger/suppress.payload.mjs'),
    "export const payload='payload-suppress-1'\n"
  )
  const mapperDeadline = Date.now() + 30000
  while (mapperRows().length < 4 && Date.now() < mapperDeadline) {
    assert(!done, 'Next watch exited before the actual suppression mapper')
    await delay(50)
  }
  assert.equal(
    mapperRows().length,
    4,
    'The actual suppression mapper was not invoked'
  )
  const suppressedAt = Date.now()
  while (Date.now() - suppressedAt < 30000) {
    assert(!done, 'Next watch exited during the suppression observation')
    const response = await fetch('http://127.0.0.1:' + port + '/v1/discovery', {
      signal: AbortSignal.timeout(1000),
    })
    assert.equal(response.status, 200)
    const api = await response.json()
    assert.equal(api.run.id, priorRun)
    assert.equal(api.run.status, 'passed')
    assert.equal(sha(readFileSync(reportPath)), priorReport)
    await delay(50)
  }
  save(path.join(output, 'SUPPRESSION.json'), {
    actualMapperCall: true,
    completedRunIdUnchanged: priorRun,
    reportBytesUnchanged: true,
    observationMs: Date.now() - suppressedAt,
  })
  writeFileSync(
    path.join(fixture, 'trigger/empty.payload.mjs'),
    "export const payload='payload-empty-1'\n"
  )
  await observe(5)
  const rows = mapperRows()
  assert.equal(rows.length, 5)
  assert.deepEqual(
    rows.map((row) => row.calls),
    [1, 2, 3, 4, 5]
  )
  assert.deepEqual(
    rows.map((row) => row.result),
    reference.mapperResults
  )
  for (const row of rows) {
    assert.equal(row.owner, 'root')
    assert.equal(row.receiverIsDefinition, true)
    assert.equal(row.groupsNullPrototype, true)
    assert.equal(row.lastIndex, 0)
    assert.equal(row.input, row.id)
    assert.equal(row.id.slice(row.index), row.match[0])
    assert.equal(row.index, fixture.length + 1)
    assert.deepEqual(
      row.groups,
      row.calls === 3
        ? { shared: 'shared' }
        : {
            kind:
              row.calls === 1
                ? 'alpha'
                : row.calls === 2
                  ? 'both'
                  : row.calls === 4
                    ? 'suppress'
                    : 'empty',
          }
    )
    assert.deepEqual(
      row.match,
      row.calls === 1
        ? ['trigger/alpha.payload.mjs', 'alpha', null]
        : row.calls === 2
          ? ['trigger/both.payload.mjs', 'both', null]
          : row.calls === 3
            ? ['shared.mjs', null, 'shared']
            : row.calls === 4
              ? ['trigger/suppress.payload.mjs', 'suppress', null]
              : ['trigger/empty.payload.mjs', 'empty', null]
    )
  }
  save(path.join(output, 'MAPPERS.json'), rows)
} catch (error) {
  failure = error
  save(path.join(output, 'ERROR.json'), {
    name: error.name,
    message: error.message,
    stack: error.stack,
  })
} finally {
  if (!done) {
    const root = readFileSync(path.join(output, 'owners/starts.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
      .find((row) => row.type === 'start' && row.ppid === process.pid)
    assert(root, 'Missing actual owned CLI identity')
    try {
      process.kill(root.pid, 'SIGTERM')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  owner = await running
  save(path.join(output, 'OWNER.json'), owner)
  writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
  writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
  try {
    assertOwnedNodeCompleted(owner, 'Actual watch-trigger CLI')
    if (!failure) {
      assert.equal(
        owner.status,
        1,
        'The actual failed empty selection must preserve the failed exit'
      )
      assert.equal(owner.signal, null)
    }
    for (const entry of owner.ownedProcesses) {
      try {
        process.kill(entry.pid, 0)
        throw new Error('Owned PID remains: ' + entry.pid)
      } catch (error) {
        if (error.code !== 'ESRCH') throw error
      }
    }
    allOwnedProcessesJoined = true
    assert.deepEqual(productPins(), before)
    productPinsHeld = true
    if (!failure) {
      const consoleRows = stripVTControlCharacters(owner.stdout)
        .split('\n')
        .filter((line) => /^(alpha shared-|beta payload-)/.test(line))
        .map((line) => line + '\n')
      assert.deepEqual(consoleRows, reference.console)
    }
  } catch (error) {
    failure ??= error
  }
  mkdirSync(path.join(output, 'authored'))
  for (const [name, body] of Object.entries(authored)) {
    mkdirSync(path.dirname(path.join(output, 'authored', name)), {
      recursive: true,
    })
    writeFileSync(path.join(output, 'authored', name), body)
  }
  if (existsSync(tracePath))
    writeFileSync(
      path.join(output, 'MAPPER-RAW.jsonl'),
      readFileSync(tracePath)
    )
  rmSync(fixture, { recursive: true, force: true })
  save(path.join(output, 'CLOSED.json'), {
    actualFiveGenerationsPassed: !failure,
    productPinsHeld,
    allOwnedProcessesJoined,
    fixtureRemoved: true,
  })
}
if (failure) throw failure
console.log(
  JSON.stringify({
    actualGenerations: 5,
    cases: 6,
    rootMapperCalls: 5,
    childMapperCalls: 0,
    completeStableReports: true,
    consoleRows: reference.console.length,
    allOwnersJoined: true,
  })
)
