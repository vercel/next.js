const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const childProcess = require('node:child_process')
const scenario = process.argv[2]
const dist =
  process.argv[3] ??
  path.join(path.dirname(require.resolve('next/package.json')), 'dist')
assert.ok(
  [
    'clean',
    'retained',
    'duplicate',
    'root-failed',
    'authored-zero',
    'invalid-config',
  ].includes(scenario)
)
const actualFork = childProcess.fork
const children = []
const joins = []
childProcess.fork = function (...args) {
  const child = Reflect.apply(actualFork, this, args)
  children.push(child)
  joins.push(
    Promise.all([
      new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', (code, signal) => resolve({ code, signal }))
      }),
      ...[child.stdout, child.stderr]
        .filter(Boolean)
        .map(
          (stream) => new Promise((resolve) => stream.once('close', resolve))
        ),
    ])
  )
  return child
}
const { openTestConfiguration } = require(
  path.join(dist, 'experimental/testing/config.js')
)
const { openCustomReporters } = require(
  path.join(dist, 'experimental/testing/reporting/custom-reporter.js')
)
let directory, configuration, reporter, prepared, deadline
const lifetime = new AbortController()
async function events() {
  return (await fs.readFile(path.join(directory, 'events.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse)
}
async function main() {
  directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'next-root-reporter-owner-')
  )
  await fs.cp(path.join(__dirname, 'reporter-root-owner-fixtures'), directory, {
    recursive: true,
  })
  if (scenario === 'invalid-config')
    await fs.writeFile(
      path.join(directory, 'next.test.config.mjs'),
      'export default { test: ; }\n'
    )
  deadline = setTimeout(
    () => lifetime.abort(new Error('Root reporter owner did not settle')),
    10000
  )
  const previous = process.env.NEXT_TEST_ROOT_REPORTER_OWNER
  process.env.NEXT_TEST_ROOT_REPORTER_OWNER = scenario
  try {
    if (scenario === 'invalid-config') {
      await assert.rejects(
        openTestConfiguration(directory, lifetime.signal),
        /Unexpected token|Expression expected/
      )
      const actual = await Promise.all(joins)
      assert.equal(children.length, 1)
      assert.ok(
        actual.every(([exit]) => exit.code === 1 && exit.signal === null)
      )
      assert.throws(() => process.kill(children[0].pid, 0), { code: 'ESRCH' })
      console.log(
        JSON.stringify({
          scenario,
          node: process.version,
          parserRejectedMalformedInput: true,
          allObservedChildrenAndPipesJoined: true,
          bodyExecuted: false,
          reportProduced: false,
        })
      )
      return
    }
    configuration = await openTestConfiguration(directory, lifetime.signal)
  } finally {
    if (previous === undefined) delete process.env.NEXT_TEST_ROOT_REPORTER_OWNER
    else process.env.NEXT_TEST_ROOT_REPORTER_OWNER = previous
  }
  assert.equal(configuration.finalExitOwnerAvailable, true)
  reporter = await openCustomReporters({
    projectDir: directory,
    reporters: [path.join(directory, 'reporter.mjs')],
    transport: await configuration.openReporterTransport(),
    finalExitLifecycle: {
      teardownTimeout: configuration.config.teardownTimeout,
    },
    signal: lifetime.signal,
    write: (text) => process.stdout.write(text),
    writeError: (text) => process.stderr.write(text),
  })
  await configuration.setup(configuration.config.projects)
  await reporter.dispose({
    ...(scenario === 'root-failed' ? { exitCodeSnapshot: { value: 1 } } : {}),
  })
  reporter = undefined
  const before = await events()
  assert.deepEqual(
    before.map((row) => row.kind),
    ['config', 'init', 'setup', 'teardown', 'close-before', 'close-after']
  )
  assert.equal(before[1].sameCacheObject, true)
  assert.equal(before[1].root, directory)
  assert.equal(before[0].pid, before[1].pid)
  const firstPreparation = configuration.prepareFinalExit()
  const secondPreparation = configuration.prepareFinalExit()
  prepared = await firstPreparation
  assert.equal(await secondPreparation, prepared)
  assert.ok(prepared)
  const physicalExit = configuration.physicalExit
  await configuration.dispose()
  const firstFinalization = prepared.finalize({ kind: 'completed' })
  if (scenario === 'duplicate')
    assert.equal(
      prepared.finalize({ kind: 'failed', exitCode: 31 }),
      firstFinalization
    )
  const exit = await firstFinalization
  assert.equal(await physicalExit, exit)
  assert.deepEqual(exit, {
    reason: 'exit',
    code: scenario === 'root-failed' ? 1 : 0,
    signal: null,
  })
  prepared = undefined
  configuration = undefined
  const data = await events()
  const held = scenario !== 'clean'
  assert.deepEqual(
    data.map((row) => row.kind),
    [
      'config',
      'init',
      'setup',
      'teardown',
      'close-before',
      'close-after',
      ...(held ? ['timeout-getter', 'timeout-entered'] : []),
    ]
  )
  const actualPid = data[0].pid
  assert.notEqual(actualPid, process.pid)
  assert.ok(data.every((row) => row.pid === actualPid))
  assert.equal(children.length, 1)
  assert.equal(children[0].pid, actualPid)
  if (scenario === 'root-failed') {
    assert.deepEqual(data[3].exitCode, { type: 'number', value: 1 })
    assert.deepEqual(data[4].exitCode, { type: 'number', value: 1 })
  }
  if (scenario === 'authored-zero') {
    assert.deepEqual(data[4].exitCode, { type: 'number', value: 7 })
    assert.deepEqual(data[5].exitCode, { type: 'number', value: 0 })
  }
  if (held) {
    assert.equal(data[7].receiver, true)
    assert.equal(data[7].argc, 0)
  }
  const joined = await Promise.all(joins)
  assert.ok(
    joined.every(
      ([actual]) => actual.code === exit.code && actual.signal === null
    )
  )
  assert.throws(() => process.kill(actualPid, 0), { code: 'ESRCH' })
  console.log(
    JSON.stringify({
      scenario,
      node: process.version,
      actualRootReporterPid: actualPid,
      controllerPid: process.pid,
      sameRootRealmAndCacheObject: true,
      rootTeardownBeforeReporterClose: true,
      allObservedChildrenAndPipesJoined: true,
      bodyExecuted: false,
      reportProduced: false,
      exit,
      events: data,
    })
  )
}
main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    clearTimeout(deadline)
    try {
      await reporter?.dispose()
    } finally {
      if (prepared)
        await prepared.finalize({ kind: 'cancelled' }).catch(() => {})
      await configuration?.dispose().catch(() => {})
      await Promise.allSettled(joins)
      childProcess.fork = actualFork
      if (directory) await fs.rm(directory, { recursive: true, force: true })
    }
  })
