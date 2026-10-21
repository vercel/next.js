import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

const [consumerArgument, outputArgument] = process.argv.slice(2)
assert(consumerArgument && outputArgument, 'consumer and output required')
const consumer = resolve(consumerArgument)
const output = resolve(outputArgument)
const require = createRequire(join(consumer, 'package.json'))
for (const name of ['vitest', 'vite'])
  assert.throws(() => require.resolve(name))
mkdirSync(output)
const source = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/production-node-watch'
)
const fixture = join(consumer, '.next-test-production-node-' + randomUUID())
mkdirSync(fixture)
const hash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const sources = {}
const staged = {}
for (const name of readdirSync(source)) {
  const target = name.endsWith('.txt') ? name.slice(0, -4) : name
  sources[name] = hash(join(source, name))
  staged[target] = sources[name]
  copyFileSync(join(source, name), join(fixture, target))
}
const expected = JSON.parse(readFileSync(join(source, 'expected.json'), 'utf8'))
const save = (name, value) =>
  writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n')
writeFileSync(
  join(fixture, 'package.json'),
  '{"private":true,"type":"module"}\n'
)
const configure = (name) =>
  writeFileSync(
    join(fixture, 'next.test.config.json'),
    JSON.stringify({
      compatibility: 'vitest',
      maxWorkers: 1,
      projects: [
        {
          name,
          environment: 'node',
          mode: 'production',
          include: ['case.test.mjs'],
          testTimeout: 60000,
          fileTimeout: 120000,
        },
      ],
    }) + '\n'
  )
configure('production-node-one')
const active = join(output, 'active.json')
const reportFile = join(output, 'report.json')
const auditDir = join(output, 'processes')
const args = [
  require.resolve('next/dist/bin/next'),
  'test',
  fixture,
  '--watch',
  '--reporter=json',
  '--outputFile',
  reportFile,
]
const env = {
  ...process.env,
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  FORCE_COLOR: '0',
  NEXT_TEST_NODE_WATCH_ACTIVE: active,
}
for (const key of [
  'CI',
  'NODE_PATH',
  'NODE_OPTIONS',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[key]
save('command.json', {
  args,
  fixture,
  runtime: process.version,
  sources,
  generationBudgetMs: 25000,
  manualKeyboardRerun: 'separate genuine and actual PTY corpus',
})
let completed
const running = runOwnedNode(args, {
  cwd: fixture,
  env,
  auditDir,
  timeoutMs: 240000,
}).then((result) => (completed = result))
function cliPID() {
  const path = join(auditDir, 'starts.jsonl')
  if (!existsSync(path)) return undefined
  for (const line of readFileSync(path, 'utf8').split('\n').slice(0, -1)) {
    const event = JSON.parse(line)
    if (event.type === 'start' && event.ppid === process.pid) return event.pid
  }
}
async function until(read, budget = 25000) {
  const deadline = Date.now() + budget
  while (Date.now() < deadline) {
    const value = read()
    if (value !== undefined) return value
    assert(
      !completed,
      'Production Node watch exited before the requested observation'
    )
    await delay(25)
  }
  throw new Error('Production Node watch observation deadline exceeded')
}
const caseFields = (report) =>
  report.testResults.flatMap((file) =>
    file.assertionResults.map(({ fullName, status, failureMessages }) => ({
      fullName,
      status,
      failureMessages,
    }))
  )
function generation(previous) {
  try {
    const bytes = readFileSync(reportFile)
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (digest === previous) return undefined
    const report = JSON.parse(bytes)
    if (
      report.numPassedTests !== 1 ||
      report.numFailedTestSuites !== 0 ||
      report.numFailedTests !== 0
    )
      return undefined
    assert.deepEqual(caseFields(report), expected.caseFields)
    const rows = report.next.events
      .filter((event) => event.type === 'output')
      .flatMap((event) => event.text.split('\n'))
      .filter((line) => line.startsWith('PRODUCTION_NODE_WATCH '))
      .map((line) => JSON.parse(line.slice('PRODUCTION_NODE_WATCH '.length)))
    assert.equal(rows.length, 1)
    return { hash: digest, bytes, report, row: rows[0] }
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError)
      return undefined
    throw error
  }
}
const observations = []
let previous
let pid
let failure
try {
  pid = await until(cliPID)
  for (let index = 0; index < 4; index++) {
    const previousGeneration = previous
    const result = await until(() => generation(previousGeneration))
    previous = result.hash
    assert.deepEqual(result.row, expected.generations[index])
    observations.push(result.row)
    save('generation' + index + '.report.json', result.report)
    for (const [name, digest] of Object.entries(staged))
      assert.equal(hash(join(fixture, name)), digest)
    if (index === 0) {
      writeFileSync(
        join(fixture, 'subject.mjs'),
        "export {dependency} from './dependency.mjs'\nexport const value = 'source-two'\n"
      )
      staged['subject.mjs'] = hash(join(fixture, 'subject.mjs'))
    }
    if (index === 1) {
      writeFileSync(
        join(fixture, 'dependency.mjs'),
        "export const dependency = 'dependency-two'\n"
      )
      staged['dependency.mjs'] = hash(join(fixture, 'dependency.mjs'))
    }
    if (index === 2) configure('production-node-two')
  }
  writeFileSync(
    join(fixture, 'subject.mjs'),
    "export {dependency} from './dependency.mjs'\nexport const value = ;\n"
  )
  const failed = await until(() => {
    try {
      const report = JSON.parse(readFileSync(reportFile, 'utf8'))
      return report.numFailedTestSuites === 1 ? report : undefined
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError)
        return undefined
      throw error
    }
  })
  assert.equal(failed.numPassedTests, 0)
  assert.deepEqual(caseFields(failed), [])
  save('failure.report.json', failed)
  writeFileSync(
    join(fixture, 'subject.mjs'),
    "export {dependency} from './dependency.mjs'\nexport const value = 'source-two'\n"
  )
  const lastGeneration = previous
  const recovery = await until(() => generation(lastGeneration))
  assert.deepEqual(recovery.row, expected.generations[3])
  observations.push(recovery.row)
  save('recovery.report.json', recovery.report)
  const lastComplete = readFileSync(reportFile)
  writeFileSync(join(fixture, 'control.mjs'), 'export const hold = true\n')
  const activeRow = await until(() =>
    existsSync(active) ? JSON.parse(readFileSync(active, 'utf8')) : undefined
  )
  assert.deepEqual(activeRow, expected.generations[3])
  save('active-observed.json', activeRow)
  process.kill(pid, 'SIGINT')
  const result = await until(() => completed, 30000)
  assertOwnedNodeCompleted(result, 'production Node watch')
  assert.equal(
    result.status,
    1,
    'completed failed run history remains authoritative after recovery and cancellation'
  )
  assert.equal(result.signal, null)
  assert.deepEqual(readFileSync(reportFile), lastComplete)
  assert.equal(
    hash(join(fixture, 'case.test.mjs')),
    sources['case.test.mjs.txt']
  )
  save('verification.json', {
    completeRows: observations.length,
    sourceEdit: true,
    transitiveDependencyEdit: true,
    configReload: true,
    syntaxFailureCases: 0,
    recovery: true,
    activeCancellation: true,
    incompletePassingReport: false,
    exitStatus: result.status,
    failedHistoryPreserved: true,
    cleanupFailures: result.cleanupFailures,
    leakedProcesses: result.leakedProcesses,
  })
} catch (error) {
  failure = error
} finally {
  if (!completed && pid) process.kill(pid, 'SIGINT')
  const result = await running
  writeFileSync(join(output, 'stdout.log'), result.stdout)
  writeFileSync(join(output, 'stderr.log'), result.stderr)
  save('observations.json', observations)
  assertOwnedNodeCompleted(result, 'production Node watch final closure')
  if (!failure) rmSync(fixture, { recursive: true, force: true })
}
if (failure) throw failure
console.log(
  'PRODUCTION_NODE_WATCH_VERIFIED ' +
    JSON.stringify({
      completeRows: observations.length,
      activeCancellation: true,
    })
)
