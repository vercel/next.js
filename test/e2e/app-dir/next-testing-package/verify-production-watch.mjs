import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
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

const [consumerArgument, outputArgument, kind, sourceArgument] =
  process.argv.slice(2)
assert(consumerArgument && outputArgument, 'consumer and output required')
assert(
  ['node', 'component'].includes(kind),
  'unknown production watch scenario'
)
assert(sourceArgument === undefined || sourceArgument === '--source')
const component = kind === 'component'
const consumer = resolve(consumerArgument)
const output = resolve(outputArgument)
const require = createRequire(join(consumer, 'package.json'))
if (component)
  for (const name of ['next', 'playwright', '@next/playwright'])
    require.resolve(name)
if (!sourceArgument)
  for (const name of ['vitest', 'vite'])
    assert.throws(() => require.resolve(name))
const source = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  component ? 'registered-production-component-watch' : 'production-node-watch'
)
const fixture = join(consumer, '.next-test-production-watch-' + randomUUID())
mkdirSync(fixture)
mkdirSync(output)
function stage(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = prefix + entry.name
    if (entry.isDirectory()) stage(join(directory, entry.name), name + '/')
    else {
      const target = join(fixture, name.replace(/\.txt$/, ''))
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(join(directory, entry.name), target)
    }
  }
}
stage(source)
const expected = JSON.parse(readFileSync(join(source, 'expected.json')))
const rows = component ? expected : expected.generations.slice(0, 4)
const fullName = component
  ? 'registered production fixture keeps real context and fresh hydration'
  : 'ordinary production Node watch retains fresh source and project identity'
const prefix = component
  ? 'REGISTERED_PRODUCTION_WATCH '
  : 'PRODUCTION_NODE_WATCH '
const write = (name, value) => writeFileSync(join(fixture, name), value)
write('package.json', '{"private":true,"type":"module"}\n')
const configure = (name) =>
  write(
    'next.test.config.json',
    JSON.stringify({
      ...(component ? {} : { compatibility: 'vitest' }),
      maxWorkers: 1,
      projects: [
        {
          name,
          environment: component ? 'browser' : 'node',
          mode: 'production',
          include: [component ? 'component.case.mjs' : 'case.test.mjs'],
          ...(component
            ? {
                browserFixtures: [
                  {
                    id: 'fixture',
                    module: './Fixture.jsx',
                    layout: './Layout.jsx',
                  },
                ],
              }
            : {}),
          testTimeout: 60000,
          fileTimeout: 120000,
        },
      ],
    }) + '\n'
  )
configure(component ? 'registered-production-watch' : 'production-node-one')
const active = join(output, 'active.json')
const control = (pending) =>
  `export const pending=${pending};export const active=${JSON.stringify(active)}\n`
if (component) write('control.mjs', control(false))
const reportFile = join(output, 'report.json')
const auditDir = join(output, 'processes')
const env = {
  ...process.env,
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  FORCE_COLOR: '0',
  NEXT_TEST_NODE_WATCH_ACTIVE: active,
}
for (const key of ['CI', 'NODE_PATH', 'NODE_OPTIONS']) delete env[key]
let completed
const running = runOwnedNode(
  [
    require.resolve('next/dist/bin/next'),
    'test',
    fixture,
    '--watch',
    '--reporter=json',
    '--outputFile',
    reportFile,
  ],
  { cwd: fixture, env, auditDir, timeoutMs: component ? 600000 : 240000 }
).then((result) => {
  completed = result
  writeFileSync(join(output, 'stdout.log'), result.stdout)
  writeFileSync(join(output, 'stderr.log'), result.stderr)
  return result
})
function readJSON(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return
    throw error
  }
}
function cliPID() {
  const file = join(auditDir, 'starts.jsonl')
  if (!existsSync(file)) return
  return readFileSync(file, 'utf8')
    .split('\n')
    .slice(0, -1)
    .map((line) => JSON.parse(line))
    .find((event) => event.type === 'start' && event.ppid === process.pid)?.pid
}
async function until(read, budget = component ? 120000 : 25000) {
  const deadline = Date.now() + budget
  while (Date.now() < deadline) {
    const value = read()
    if (value !== undefined) return value
    assert(!completed, 'Watch exited before the requested observation')
    await delay(25)
  }
  throw Error('Production watch observation deadline exceeded')
}
const caseFields = (report) =>
  report.testResults.flatMap((file) =>
    file.assertionResults.map(({ fullName, status, failureMessages }) => ({
      fullName,
      status,
      failureMessages,
    }))
  )
let previous, pid, failure
const observations = []
async function passed(expectedRow, name) {
  const result = await until(() => {
    const report = readJSON(reportFile)
    if (!report) return
    const bytes = JSON.stringify(report)
    if (
      bytes === previous ||
      report.numPassedTests !== 1 ||
      report.numFailedTests !== 0 ||
      report.numFailedTestSuites !== 0
    )
      return
    assert.deepEqual(caseFields(report), [
      { fullName, status: 'passed', failureMessages: [] },
    ])
    const actual = report.next.events
      .filter((event) => event.type === 'output')
      .flatMap((event) => event.text.split('\n'))
      .filter((line) => line.startsWith(prefix))
      .map((line) => JSON.parse(line.slice(prefix.length)))
    assert.deepEqual(actual, [expectedRow])
    return { bytes, report, row: actual[0] }
  })
  previous = result.bytes
  observations.push(result.row)
  writeFileSync(
    join(output, name + '.report.json'),
    JSON.stringify(result.report)
  )
}
try {
  pid = await until(cliPID, 20000)
  for (let index = 0; index < rows.length; index++) {
    await passed(rows[index], 'generation' + index)
    if (component) {
      assert(!existsSync(join(fixture, '.next/lock')))
      if (index === 0) write('label.js', "export const label='two'\n")
      if (index === 1)
        write('counter.module.css', '.button { color: rgb(44, 55, 66); }\n')
    } else {
      if (index === 0)
        write(
          'subject.mjs',
          "export {dependency} from './dependency.mjs'\nexport const value = 'source-two'\n"
        )
      if (index === 1)
        write('dependency.mjs', "export const dependency = 'dependency-two'\n")
      if (index === 2) configure('production-node-two')
    }
  }
  if (!component) {
    write(
      'subject.mjs',
      "export {dependency} from './dependency.mjs'\nexport const value = ;\n"
    )
    const failed = await until(() => {
      const report = readJSON(reportFile)
      return report?.numFailedTestSuites === 1 ? report : undefined
    })
    assert.equal(failed.numPassedTests, 0)
    assert.deepEqual(caseFields(failed), [])
    writeFileSync(join(output, 'failure.report.json'), JSON.stringify(failed))
    write(
      'subject.mjs',
      "export {dependency} from './dependency.mjs'\nexport const value = 'source-two'\n"
    )
    await passed(rows.at(-1), 'recovery')
  }
  const lastComplete = readFileSync(reportFile)
  write('control.mjs', component ? control(true) : 'export const hold = true\n')
  const activeBody = await until(() => readJSON(active))
  if (component) {
    assert.equal(activeBody.mounted, true)
    assert.equal(activeBody.nativeWaitStarted, true)
    assert.deepEqual(activeBody.row, rows.at(-1))
  } else assert.deepEqual(activeBody, rows.at(-1))
  process.kill(pid, 'SIGINT')
  await until(() => completed, 30000)
  assertOwnedNodeCompleted(completed, 'production ' + kind + ' watch')
  assert.equal(completed.status, component ? 130 : 1)
  assert.equal(completed.signal, null)
  if (!component) assert.deepEqual(readFileSync(reportFile), lastComplete)
  writeFileSync(
    join(output, 'VERIFIED.json'),
    JSON.stringify({
      kind,
      generations: observations.length,
      activeCancellation: true,
      ...(component
        ? { sourceAndCSSEdits: true }
        : {
            sourceEdit: true,
            transitiveDependencyEdit: true,
            configReload: true,
            syntaxFailureCases: 0,
            recovery: true,
            failedHistoryPreserved: true,
          }),
    }) + '\n'
  )
} catch (error) {
  failure = error
} finally {
  pid ??= cliPID()
  if (!completed && pid) {
    try {
      process.kill(pid, 'SIGINT')
    } catch (error) {
      if (error.code !== 'ESRCH') failure ??= error
    }
  }
  const result = await running
  assertOwnedNodeCompleted(result, 'production watch final closure')
  rmSync(fixture, { recursive: true, force: true })
}
if (failure) throw failure
