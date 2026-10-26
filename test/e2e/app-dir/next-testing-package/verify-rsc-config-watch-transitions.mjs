import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  existsSync,
  rmSync,
} from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'
const [consumerArgument, outputArgument, flow = 'settled'] =
  process.argv.slice(2)
assert(['settled', 'active'].includes(flow), 'known transition flow')
const consumer = resolve(consumerArgument),
  out = resolve(outputArgument),
  require = createRequire(join(consumer, 'package.json'))
const source = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/production-rsc-route-watch'
)
const nodeSource = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/config-rsc-transition'
)
for (const name of ['vitest', 'vite', '@vitest/mocker'])
  assert.throws(() => require.resolve(name))
const fixture = join(consumer, '.next-test-config-transition-' + randomUUID())
mkdirSync(fixture)
mkdirSync(out)
const original = {}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
function stage(root, prefix = '', base = root) {
  for (const item of readdirSync(root, { withFileTypes: true })) {
    const name = prefix + item.name
    if (item.isDirectory()) stage(join(root, item.name), name + '/', base)
    else if (item.isFile()) {
      const target = join(
        fixture,
        name.endsWith('.txt') ? name.slice(0, -4) : name
      )
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(join(base, name), target)
      original[join(base, name)] = digest(readFileSync(join(base, name)))
    }
  }
}
stage(source)
stage(nodeSource)
writeFileSync(
  join(fixture, 'package.json'),
  '{"private":true,"type":"module"}\n'
)
const nodeBodies = {
  'node-first.case.mjs': {
    sha256: 'afcc67eccc855361c8b85d17a2c333fe807e911099096a7e6b0aa376b2cabaa8',
    title: 'initial Node profile receives own provided value',
  },
  'node-back.case.mjs': {
    sha256: '0e2e03692e3a3b15fed9276ac67b5474e7eb8932313756e87cbacb1cb4e44232',
    title: 'returned Node profile receives own provided value',
  },
}
for (const [file, value] of Object.entries(nodeBodies))
  assert.equal(digest(readFileSync(join(fixture, file))), value.sha256)
writeFileSync(
  join(fixture, 'route-other.case.jsx'),
  readFileSync(join(fixture, 'route.case.jsx'))
)
const configFile = join(fixture, 'next.test.config.json')
const configure = (file) =>
  writeFileSync(configFile, readFileSync(join(fixture, file)))
configure('node-first.config.json')
const save = (name, value) =>
  writeFileSync(join(out, name), JSON.stringify(value, null, 2) + '\n')
save('AUTHORED.json', {
  nodeBodies,
  app: original,
  routeCopyUnchanged:
    digest(readFileSync(join(fixture, 'route-other.case.jsx'))) ===
    digest(readFileSync(join(fixture, 'route.case.jsx'))),
})
const expected = JSON.parse(readFileSync(join(fixture, 'expected.json'))),
  reportFile = join(out, 'cases.json'),
  active = join(out, 'active.json')
const env = {
  ...process.env,
  NODE_ENV: 'development',
  NEXT_TELEMETRY_DISABLED: '1',
  FORCE_COLOR: '0',
  TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
  TRANSITION_ACTIVE: active,
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
let completed, lastHash, pid, failure
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
  { cwd: fixture, env, auditDir: join(out, 'processes'), timeoutMs: 480000 }
).then((result) => {
  completed = result
  save('RESULT.json', result)
  writeFileSync(join(out, 'stdout.log'), result.stdout)
  writeFileSync(join(out, 'stderr.log'), result.stderr)
  return result
})
async function until(read, budget = 120000) {
  const deadline = Date.now() + budget
  while (Date.now() < deadline) {
    const value = read()
    if (value !== undefined) return value
    assert(!completed, 'watch exited before requested transition')
    await delay(25)
  }
  throw Error('Transition observation deadline exceeded')
}
function report() {
  try {
    const bytes = readFileSync(reportFile),
      hash = digest(bytes)
    if (hash === lastHash) return
    return { bytes, hash, value: JSON.parse(bytes) }
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return
    throw error
  }
}
const fields = (report) =>
  report.testResults.flatMap((file) =>
    file.assertionResults.map(({ fullName, status, failureMessages }) => ({
      fullName,
      status,
      failureMessages,
    }))
  )
const output = (report, prefix) =>
  report.next.events
    .filter((event) => event.type === 'output')
    .flatMap((event) => event.text.split('\n'))
    .filter((line) => line.startsWith(prefix))
    .map((line) => JSON.parse(line.slice(prefix.length)))
const observed = []
async function passed(name, file, title, prefix, row) {
  const actual = await until(() => {
    const next = report()
    if (
      !next ||
      next.value.numPassedTests !== 1 ||
      next.value.numFailedTests ||
      next.value.numFailedTestSuites ||
      !next.value.testResults.some((value) => value.name.endsWith('/' + file))
    )
      return
    const cases = fields(next.value)
    if (cases.length !== 1 || cases[0].fullName !== title) return
    return next
  })
  assert.deepEqual(fields(actual.value), [
    { fullName: title, status: 'passed', failureMessages: [] },
  ])
  assert.deepEqual(output(actual.value, prefix), [row])
  lastHash = actual.hash
  save(name + '.json', actual.value)
  observed.push({ name, file, title, row })
  return actual
}
const rscTitle =
  'production explicit route preserves refreshed root and segment layouts plus request state'
try {
  pid = await until(() => {
    const file = join(out, 'processes/starts.jsonl')
    if (!existsSync(file)) return
    for (const line of readFileSync(file, 'utf8').split('\n').slice(0, -1)) {
      const value = JSON.parse(line)
      if (value.type === 'start' && value.ppid === process.pid) return value.pid
    }
  })
  await passed(
    'initial-node',
    'node-first.case.mjs',
    nodeBodies['node-first.case.mjs'].title,
    'NODE_TRANSITION ',
    { phase: 'node-first' }
  )
  if (flow === 'active') {
    writeFileSync(
      join(fixture, 'node-control.mjs'),
      'export const hold = true\n'
    )
    assert.deepEqual(
      await until(() =>
        existsSync(active)
          ? JSON.parse(readFileSync(active, 'utf8'))
          : undefined
      ),
      { phase: 'node-first' }
    )
    save('held-node.json', {
      observed: JSON.parse(readFileSync(active, 'utf8')),
    })
    rmSync(active)
    configure('rsc.config.json')
    await passed(
      'active-node-to-rsc',
      'route.case.jsx',
      rscTitle,
      'RSC_ROUTE_WATCH ',
      expected[0]
    )
    writeFileSync(
      join(fixture, 'node-control.mjs'),
      'export const hold = false\n'
    )
    writeFileSync(join(fixture, 'control.mjs'), 'export const hold = true\n')
    assert.deepEqual(
      await until(() =>
        existsSync(active)
          ? JSON.parse(readFileSync(active, 'utf8'))
          : undefined
      ),
      expected[0]
    )
    save('held-rsc.json', {
      observed: JSON.parse(readFileSync(active, 'utf8')),
    })
    rmSync(active)
    configure('node-back.config.json')
    await passed(
      'active-rsc-back-to-node',
      'node-back.case.mjs',
      nodeBodies['node-back.case.mjs'].title,
      'NODE_TRANSITION ',
      { phase: 'node-back' }
    )
  } else {
    configure('rsc.config.json')
    await passed(
      'to-rsc',
      'route.case.jsx',
      rscTitle,
      'RSC_ROUTE_WATCH ',
      expected[0]
    )
    writeFileSync(
      join(fixture, 'view-version.mjs'),
      "export const version = 'version-two'\n"
    )
    await passed(
      'rsc-dependency',
      'route.case.jsx',
      rscTitle,
      'RSC_ROUTE_WATCH ',
      expected[1]
    )
    configure('rsc-renamed.config.json')
    await passed(
      'rsc-include-profile-change',
      'route-other.case.jsx',
      rscTitle,
      'RSC_ROUTE_WATCH ',
      expected[1]
    )
    configure('node-back.config.json')
    await passed(
      'back-to-node',
      'node-back.case.mjs',
      nodeBodies['node-back.case.mjs'].title,
      'NODE_TRANSITION ',
      { phase: 'node-back' }
    )
  }
  configure('node-failure.config.json')
  const failed = await until(() => {
    const next = report()
    if (!next || next.value.numFailedTests !== 1) return
    return next
  })
  const failedCases = fields(failed.value)
  assert.equal(failed.value.numFailedTestSuites, 1)
  assert.equal(failedCases.length, 1)
  assert.equal(failedCases[0].fullName, nodeBodies['node-back.case.mjs'].title)
  assert.equal(failedCases[0].status, 'failed')
  assert.equal(failedCases[0].failureMessages.length, 1)
  assert.match(failedCases[0].failureMessages[0], /intentional-config-failure/)
  assert.match(failedCases[0].failureMessages[0], /node-back/)
  lastHash = failed.hash
  save('provided-context-failure.json', failed.value)
  configure('node-back.config.json')
  const healthy = await passed(
    'node-recovery',
    'node-back.case.mjs',
    nodeBodies['node-back.case.mjs'].title,
    'NODE_TRANSITION ',
    { phase: 'node-back' }
  )
  writeFileSync(join(fixture, 'node-control.mjs'), 'export const hold = true\n')
  assert.deepEqual(
    await until(() =>
      existsSync(active) ? JSON.parse(readFileSync(active, 'utf8')) : undefined
    ),
    { phase: 'node-back' }
  )
  process.kill(pid, 'SIGINT')
  const result = await until(() => completed, 30000)
  assertOwnedNodeCompleted(result, 'Node RSC config transitions')
  assert.equal(result.status, 1)
  assert.deepEqual(readFileSync(reportFile), healthy.bytes)
  save('VERIFIED.json', {
    flow,
    mode: 'development',
    passingGenerations: observed,
    activeSupersessionBothDirections: flow === 'active',
    ordinaryRscRows: flow === 'settled' ? 2 : 1,
    providedContextFailureRecovery: true,
    activeCancellation: true,
    reportRetained: true,
    status: result.status,
    allOwnersJoined: true,
    sourceFeatureUnchanged: true,
  })
} catch (error) {
  failure = error
  save('FAILURE.json', { message: error.message, stack: error.stack })
  if (pid && !completed) process.kill(pid, 'SIGINT')
} finally {
  await running
  for (const [name, hash] of Object.entries(original))
    assert.equal(digest(readFileSync(name)), hash)
  rmSync(fixture, { recursive: true, force: true })
  if (existsSync(join(out, 'VERIFIED.json')))
    save('VERIFIED.json', {
      ...JSON.parse(readFileSync(join(out, 'VERIFIED.json'), 'utf8')),
      allInputsRemovedAfterOwnedReadersJoined: !existsSync(fixture),
    })
}
if (failure) throw failure
