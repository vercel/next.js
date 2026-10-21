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
for (const name of ['next', 'playwright', '@next/playwright'])
  require.resolve(name)
for (const name of ['vitest', 'vite'])
  assert.throws(() => require.resolve(name))
mkdirSync(output)
const directory = dirname(fileURLToPath(import.meta.url))
const source = join(directory, 'fixtures/registered-production-component-watch')
const fixture = join(
  consumer,
  '.next-test-registered-production-' + randomUUID()
)
mkdirSync(fixture)
const hash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const sources = {}
const staged = {}
function stage(path, prefix = '') {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const name = prefix + entry.name
    if (entry.isDirectory()) stage(join(path, entry.name), name + '/')
    else if (entry.isFile()) {
      const target = name.endsWith('.txt') ? name.slice(0, -4) : name
      sources[name] = hash(join(path, entry.name))
      staged[target] = sources[name]
      mkdirSync(dirname(join(fixture, target)), { recursive: true })
      copyFileSync(join(path, entry.name), join(fixture, target))
    }
  }
}
stage(source)
const expected = JSON.parse(readFileSync(join(source, 'expected.json'), 'utf8'))
const save = (name, value) =>
  writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n')
writeFileSync(
  join(fixture, 'package.json'),
  '{"private":true,"type":"module"}\n'
)
writeFileSync(
  join(fixture, 'next.test.config.json'),
  JSON.stringify({
    maxWorkers: 1,
    projects: [
      {
        name: 'registered-production-watch',
        environment: 'browser',
        mode: 'production',
        include: ['component.case.mjs'],
        browserFixtures: [
          { id: 'fixture', module: './Fixture.jsx', layout: './Layout.jsx' },
        ],
        testTimeout: 60000,
        fileTimeout: 120000,
      },
    ],
  }) + '\n'
)
const active = join(output, 'active.json')
const control = (pending) =>
  `export const pending=${pending};export const active=${JSON.stringify(active)}\n`
writeFileSync(join(fixture, 'control.mjs'), control(false))
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
  generationBudgetMs: 120000,
})
let completed
const running = runOwnedNode(args, {
  cwd: fixture,
  env,
  auditDir,
  timeoutMs: 600000,
}).then((result) => (completed = result))
function cliPID() {
  const path = join(auditDir, 'starts.jsonl')
  if (!existsSync(path)) return undefined
  for (const line of readFileSync(path, 'utf8').split('\n').slice(0, -1)) {
    const event = JSON.parse(line)
    if (event.type === 'start' && event.ppid === process.pid) return event.pid
  }
}
async function until(read, budget) {
  const deadline = Date.now() + budget
  while (Date.now() < deadline) {
    const value = read()
    if (value !== undefined) return value
    assert(!completed, 'Watch exited before the requested observation')
    await delay(25)
  }
  throw new Error('Registered production watch observation deadline exceeded')
}
function generation(previous) {
  try {
    const bytes = readFileSync(reportFile)
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (digest === previous) return undefined
    const report = JSON.parse(bytes)
    assert.equal(report.numFailedTests, 0)
    assert.equal(report.numFailedTestSuites, 0)
    assert.equal(report.numPassedTests, 1)
    const cases = report.testResults.flatMap((file) =>
      file.assertionResults.map(({ fullName, status, failureMessages }) => ({
        fullName,
        status,
        failureMessages,
      }))
    )
    assert.deepEqual(cases, [
      {
        fullName:
          'registered production fixture keeps real context and fresh hydration',
        status: 'passed',
        failureMessages: [],
      },
    ])
    const rows = report.next.events
      .filter((event) => event.type === 'output')
      .flatMap((event) => event.text.split('\n'))
      .filter((line) => line.startsWith('REGISTERED_PRODUCTION_WATCH '))
      .map((line) =>
        JSON.parse(line.slice('REGISTERED_PRODUCTION_WATCH '.length))
      )
    assert.equal(rows.length, 1)
    return { hash: digest, report, row: rows[0] }
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
  pid = await until(cliPID, 20000)
  for (let index = 0; index < expected.length; index++) {
    const previousGeneration = previous
    const result = await until(() => generation(previousGeneration), 120000)
    previous = result.hash
    assert.deepEqual(result.row, expected[index])
    save('generation' + index + '.report.json', result.report)
    observations.push(result.row)
    for (const [name, digest] of Object.entries(staged))
      assert.equal(hash(join(fixture, name)), digest)
    assert(!existsSync(join(fixture, '.next/lock')))
    if (index === 0) {
      writeFileSync(join(fixture, 'label.js'), "export const label='two'\n")
      staged['label.js'] = hash(join(fixture, 'label.js'))
    }
    if (index === 1) {
      writeFileSync(
        join(fixture, 'counter.module.css'),
        '.button { color: rgb(44, 55, 66); }\n'
      )
      staged['counter.module.css'] = hash(join(fixture, 'counter.module.css'))
    }
  }
  writeFileSync(join(fixture, 'control.mjs'), control(true))
  const activeBody = await until(
    () =>
      existsSync(active) ? JSON.parse(readFileSync(active, 'utf8')) : undefined,
    120000
  )
  assert.equal(activeBody.mounted, true)
  assert.equal(activeBody.nativeWaitStarted, true)
  assert.deepEqual(activeBody.row, expected.at(-1))
  save('active-observed.json', activeBody)
} catch (error) {
  failure = error
} finally {
  pid ??= cliPID()
  if (pid && !completed) {
    try {
      process.kill(pid, 'SIGINT')
    } catch (error) {
      if (error.code !== 'ESRCH') failure ??= error
    }
  }
}
const result = await running
writeFileSync(join(output, 'stdout.log'), result.stdout)
writeFileSync(join(output, 'stderr.log'), result.stderr)
save('observations.json', observations)
save('exit.json', {
  status: result.status,
  cleanupFailures: result.cleanupFailures,
  observationFailure: failure?.stack ?? null,
})
try {
  assertOwnedNodeCompleted(result, 'registered production component watch')
  if (failure) throw failure
  assert.equal(result.status, 130)
  assert.deepEqual(observations, expected)
  save('verification.json', {
    completeReferenceRows: observations.length,
    importedSourceAndCSSChanged: true,
    activeCancellation: true,
    status: result.status,
    passiveObserver: false,
  })
} finally {
  for (const [name, digest] of Object.entries(sources))
    assert.equal(hash(join(source, name)), digest)
  for (const [name, digest] of Object.entries(staged))
    assert.equal(hash(join(fixture, name)), digest)
  rmSync(fixture, { recursive: true, force: true })
  save('closed.json', {
    fixtureRemoved: true,
    allSourceAndBodyBytesHeld: true,
    ownedProcessesClosed: true,
  })
}
