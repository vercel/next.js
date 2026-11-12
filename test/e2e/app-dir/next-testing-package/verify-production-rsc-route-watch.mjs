import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  copyFileSync,
  rmSync,
} from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'
const [consumerArgument, outputArgument] = process.argv.slice(2)
assert(consumerArgument && outputArgument, 'consumer and output required')
const consumer = resolve(consumerArgument),
  out = resolve(outputArgument),
  mode = 'production'
const require = createRequire(join(consumer, 'package.json'))
for (const name of ['vitest', 'vite', '@vitest/mocker'])
  assert.throws(() => require.resolve(name))
const cli = require.resolve('next/dist/bin/next')
const source = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/production-rsc-route-watch'
)
const fixture = join(
  consumer,
  '.next-test-production-rsc-watch-' + randomUUID()
)
mkdirSync(fixture)
mkdirSync(out)
const staged = {}
function stage(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = prefix + entry.name
    if (entry.isDirectory()) stage(join(directory, entry.name), name + '/')
    else if (entry.isFile()) {
      const target = name.endsWith('.txt') ? name.slice(0, -4) : name
      mkdirSync(dirname(join(fixture, target)), { recursive: true })
      copyFileSync(join(source, name), join(fixture, target))
      staged[name] = createHash('sha256')
        .update(readFileSync(join(source, name)))
        .digest('hex')
    }
  }
}
stage(source)
writeFileSync(
  join(fixture, 'package.json'),
  '{"private":true,"type":"module"}\n'
)
const expected = JSON.parse(readFileSync(join(fixture, 'expected.json')))
const save = (name, value) =>
  writeFileSync(join(out, name), JSON.stringify(value, null, 2) + '\n')
const initial = {}
for (const name of [
  'view-version.mjs',
  'app/proof/[id]/layout.jsx',
  'app/proof/[id]/page.jsx',
  'route.case.jsx',
])
  initial[name] = readFileSync(join(fixture, name), 'utf8')
const active = join(out, 'active.json')
const reportFile = join(out, 'cases.json')
const env = {
  ...process.env,
  NODE_ENV: mode,
  NEXT_TELEMETRY_DISABLED: '1',
  FORCE_COLOR: '0',
  TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
  RSC_WATCH_ACTIVE: active,
}
for (const key of [
  'NODE_OPTIONS',
  'NODE_PATH',
  'CI',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[key]
let completed
const running = runOwnedNode(
  [
    cli,
    'test',
    fixture,
    '--watch',
    '--reporter=json',
    '--outputFile',
    reportFile,
  ],
  { cwd: fixture, env, auditDir: join(out, 'processes'), timeoutMs: 480000 }
).then((result) => {
  completed = result
  writeFileSync(join(out, 'stdout.log'), result.stdout)
  writeFileSync(join(out, 'stderr.log'), result.stderr)
  save('RESULT.json', result)
  return result
})
async function until(read, budget = 60000) {
  const deadline = Date.now() + budget
  while (Date.now() < deadline) {
    const value = read()
    if (value !== undefined) return value
    assert(!completed, 'watch exited before requested observation')
    await delay(25)
  }
  throw Error('RSC watch observation deadline exceeded')
}
const fields = (report) =>
  report.testResults.flatMap((file) =>
    file.assertionResults.map(({ fullName, status, failureMessages }) => ({
      fullName,
      status,
      failureMessages,
    }))
  )
const rows = (report) =>
  report.next.events
    .filter((event) => event.type === 'output')
    .flatMap((event) => event.text.split('\n'))
    .filter((line) => line.startsWith('RSC_ROUTE_WATCH '))
    .map((line) => JSON.parse(line.slice('RSC_ROUTE_WATCH '.length)))
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
let lastHash, pid, failure
const observed = []
function report() {
  try {
    const bytes = readFileSync(reportFile)
    const hash = digest(bytes)
    if (hash === lastHash) return
    return { bytes, hash, value: JSON.parse(bytes) }
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return
    throw error
  }
}
async function passed(index, name) {
  const actual = await until(() => {
    const next = report()
    if (
      !next ||
      next.value.numPassedTests !== 1 ||
      next.value.numFailedTests ||
      next.value.numFailedTestSuites
    )
      return
    return next
  }, 120000)
  assert.deepEqual(rows(actual.value), [expected[index]])
  assert.deepEqual(fields(actual.value), [
    {
      fullName:
        'production explicit route preserves refreshed root and segment layouts plus request state',
      status: 'passed',
      failureMessages: [],
    },
  ])
  lastHash = actual.hash
  save(name + '.json', actual.value)
  observed.push({ name, row: rows(actual.value)[0] })
  return actual
}
async function failed(name, pattern) {
  const actual = await until(() => {
    const next = report()
    if (!next || next.value.numFailedTestSuites !== 1) return
    return next
  }, 120000)
  assert.equal(actual.value.numPassedTests, 0)
  if (name === 'route-config-failure') {
    const cases = fields(actual.value)
    assert.equal(cases.length, 1)
    assert.equal(cases[0].status, 'failed')
    assert.equal(
      cases[0].fullName,
      'production explicit route preserves refreshed root and segment layouts plus request state'
    )
    assert.equal(cases[0].failureMessages.length, 1)
    assert.match(
      cases[0].failureMessages[0],
      /Full route rendering currently requires force-dynamic routes without Cache Components or PPR/
    )
  } else assert.deepEqual(fields(actual.value), [])
  assert.match(JSON.stringify(actual.value), pattern)
  lastHash = actual.hash
  save(name + '.json', actual.value)
  return actual
}
try {
  pid = await until(() => {
    const p = join(out, 'processes/starts.jsonl')
    if (!existsSync(p)) return
    for (const line of readFileSync(p, 'utf8').split('\n').slice(0, -1)) {
      const event = JSON.parse(line)
      if (event.type === 'start' && event.ppid === process.pid) return event.pid
    }
  })
  await passed(0, 'initial')
  writeFileSync(
    join(fixture, 'view-version.mjs'),
    "export const version = 'version-two'\n"
  )
  await passed(1, 'shared-dependency-edit')
  writeFileSync(
    join(fixture, 'app/proof/[id]/layout.jsx'),
    initial['app/proof/[id]/layout.jsx'].replace(
      'data-nested-version={version}',
      "data-nested-version={version+'-layout'}"
    )
  )
  await passed(2, 'nested-layout-edit')
  const healthyPage = initial['app/proof/[id]/page.jsx'].replace(
    "header:h.get('x-route-proof')",
    "header:'updated:'+h.get('x-route-proof')"
  )
  writeFileSync(join(fixture, 'app/proof/[id]/page.jsx'), healthyPage)
  await passed(3, 'page-edit')
  writeFileSync(
    join(fixture, 'app/proof/[id]/page.jsx'),
    healthyPage + '\nexport const broken = ;\n'
  )
  await failed('syntax-failure', /Parsing|Expression expected|Unexpected/)
  writeFileSync(join(fixture, 'app/proof/[id]/page.jsx'), healthyPage)
  await passed(3, 'syntax-recovery')
  writeFileSync(
    join(fixture, 'app/proof/[id]/page.jsx'),
    healthyPage.replace("dynamic='force-dynamic'", "dynamic='force-static'")
  )
  await failed(
    'route-config-failure',
    /force-dynamic|dynamic.*route|route.*dynamic/
  )
  writeFileSync(join(fixture, 'app/proof/[id]/page.jsx'), healthyPage)
  const healthy = await passed(3, 'route-config-recovery')
  writeFileSync(join(fixture, 'control.mjs'), 'export const hold = true\n')
  const activeRow = await until(() => {
    if (existsSync(active)) return JSON.parse(readFileSync(active, 'utf8'))
  }, 120000)
  assert.deepEqual(activeRow, expected[3])
  process.kill(pid, 'SIGINT')
  const result = await until(() => completed, 30000)
  assertOwnedNodeCompleted(result, 'production explicit RSC watch')
  assert.equal(
    result.status,
    1,
    'completed failure history remains authoritative'
  )
  assert.deepEqual(
    readFileSync(reportFile),
    healthy.bytes,
    'cancelled unfinished generation must not replace last completed report'
  )
  save('VERIFIED.json', {
    mode,
    ordinaryReferenceRows: 4,
    passingGenerations: observed,
    syntaxFailure: true,
    routeConfigFailure: true,
    activeCancellation: true,
    retainedCompleteReport: true,
    allOwnersJoined: true,
    status: result.status,
    cleanupFailures: result.cleanupFailures,
    leakedProcesses: result.leakedProcesses,
    registrationFailures: result.registrationFailures,
  })
} catch (error) {
  failure = error
  save('FAILURE.json', { message: error.message, stack: error.stack })
  if (pid && !completed) process.kill(pid, 'SIGINT')
} finally {
  await running
  for (const [name, hash] of Object.entries(staged))
    assert.equal(digest(readFileSync(join(source, name))), hash)
  rmSync(fixture, { recursive: true, force: true })
  if (existsSync(join(out, 'VERIFIED.json'))) {
    save('VERIFIED.json', {
      ...JSON.parse(readFileSync(join(out, 'VERIFIED.json'), 'utf8')),
      allInputsRemovedAfterOwnedReadersJoined: !existsSync(fixture),
    })
  }
}
if (failure) throw failure
