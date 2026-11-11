'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { fork } = require('node:child_process')
const output = path.resolve(process.argv[2])
const role = process.argv[3] || 'passive'
const dist =
  process.argv[4] ||
  path.join(path.dirname(require.resolve('next/package.json')), 'dist')
const fixtures = path.join(__dirname, 'root-run-start-fixtures')
const fixture = path.join(output, 'fixture')
const traceFile = path.join(output, 'trace.jsonl')
const releaseFile = path.join(output, 'release')
fs.mkdirSync(fixture, { recursive: true })
const hash = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const fixturePins = {}
for (const name of ['first.mjs', 'second.mjs', 'a.test.mjs', 'b.test.mjs']) {
  const input = path.join(fixtures, name + '.txt'),
    target = path.join(fixture, name)
  fs.copyFileSync(input, target)
  fixturePins[name] = hash(target)
  assert.equal(fixturePins[name], hash(input))
}
const windows = process.platform === 'win32'
const worker = path.join(
  dist,
  'experimental/testing/reporting/custom-reporter-worker.js'
)
const guardFile = path.join(__dirname, 'root-run-start-worker-guard.cjs')
process.env.ROOT_RUN_START_GUARD_AUDIT = path.join(output, 'guard')
const hostGuard = require(guardFile)
const first = path.join(fixture, 'first.mjs'),
  second = path.join(fixture, 'second.mjs')
const facts =
  role === 'empty'
    ? []
    : [
        {
          entryId: 'alpha:a',
          moduleId: path.join(fixture, 'a.test.mjs'),
          projectId: 'alpha',
          projectName: 'alpha',
          root: fixture,
          pool: 'forks',
        },
        {
          entryId: 'alpha:b',
          moduleId: path.join(fixture, 'b.test.mjs'),
          projectId: 'alpha',
          projectName: 'alpha',
          root: fixture,
          pool: 'forks',
        },
        {
          entryId: 'beta:a',
          moduleId: path.join(fixture, 'a.test.mjs'),
          projectId: 'beta',
          projectName: 'beta',
          root: fixture,
          pool: 'forks',
        },
      ]
const rows = () =>
  fs.existsSync(traceFile)
    ? fs
        .readFileSync(traceFile, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse)
    : []
const stdout = fs.openSync(path.join(output, 'worker-stdout.log'), 'w')
const stderr = fs.openSync(path.join(output, 'worker-stderr.log'), 'w')
const child = fork(worker, [], {
  cwd: fixture,
  execArgv: [],
  detached: !windows,
  stdio: ['ignore', stdout, stderr, 'ipc'],
  env: {
    ...process.env,
    NODE_OPTIONS:
      '--require=' +
      JSON.stringify(guardFile) +
      (process.env.NODE_OPTIONS ? ' ' + process.env.NODE_OPTIONS : ''),
    ROOT_RUN_START_TRACE: traceFile,
    ROOT_RUN_START_ROLE: role,
    ROOT_RUN_START_RELEASE: releaseFile,
    ROOT_RUN_START_GUARD_AUDIT: path.join(output, 'guard'),
  },
})
let closed,
  pending,
  responseCount = 0
const messages = []
const joins = new Promise((resolve) =>
  child.once('close', (code, signal) => {
    closed = { code, signal }
    pending?.reject(new Error('Reporter closed before its response'))
    pending = undefined
    for (const watcher of watchers) watcher()
    resolve()
  })
)
child.on('error', (error) => pending?.reject(error))
child.on('message', (message) => {
  messages.push(message)
  if (
    !['custom-reporter-result', 'custom-reporter-failed'].includes(
      message?.type
    )
  )
    return
  responseCount++
  assert(pending, 'Each reporter result belongs to a pending real IPC request')
  const current = pending
  pending = undefined
  current.resolve(message)
})
function request(message) {
  assert(!pending, 'Only one request owns a response')
  return new Promise((resolve, reject) => {
    pending = { resolve, reject }
    child.send(message, (error) => {
      if (error) {
        pending = undefined
        reject(error)
      }
    })
  })
}
const watchers = new Set()
function waitForTrace(predicate) {
  return new Promise((resolve, reject) => {
    function changed() {
      try {
        if (closed)
          throw new Error('Reporter closed before its owned trace gate')
        const observed = rows()
        if (!predicate(observed)) return
        fs.unwatchFile(traceFile, changed)
        watchers.delete(changed)
        resolve(observed)
      } catch (error) {
        fs.unwatchFile(traceFile, changed)
        watchers.delete(changed)
        reject(error)
      }
    }
    watchers.add(changed)
    fs.watchFile(traceFile, { interval: 10 }, changed)
    changed()
  })
}
let deadlineFired = false
const deadline = setTimeout(() => {
  deadlineFired = true
  try {
    process.kill(windows ? child.pid : -child.pid, 'SIGKILL')
  } catch {}
}, 15000)
const summary = {
  role,
  node: process.version,
  output,
  facts,
  fixturePins,
  pid: child.pid,
  worker,
}
;(async () => {
  const initialized = await request({
    type: 'run',
    input: {
      files: [first, second],
      projectDir: fixture,
      queuedProjectRoot: fixture,
    },
  })
  assert.equal(initialized.type, 'custom-reporter-result')
  assert.equal(initialized.captureRunStart, true)
  assert(
    !rows().some((row) => row.kind.endsWith('get-start')),
    'Initialization must not evaluate authored RunStart accessors'
  )
  const startResponseCount = responseCount
  const start = request({ type: 'run-start', specifications: facts })
  if (role === 'async-barrier') {
    await waitForTrace((values) =>
      values.some((row) => row.kind === 'second-start')
    )
    assert.equal(
      responseCount,
      startResponseCount,
      'The response must wait for the first callback promise'
    )
    assert(!rows().some((row) => row.kind === 'first-start-finished'))
    fs.writeFileSync(releaseFile, 'release')
  }
  const response = await start
  summary.startResponse = response
  const failing =
    ['getter-throw', 'sync-throw', 'async-reject'].includes(role) ||
    (role.startsWith('mutate-') && role !== 'mutate-array')
  if (failing) {
    assert.equal(response.type, 'custom-reporter-failed')
    if (role.startsWith('mutate-'))
      assert.match(
        response.error.message,
        /Custom reporter specification mutation requires a Next selection adapter and is not implemented/
      )
    else
      assert.match(
        response.error.message,
        /root run start first (getter|synchronous|asynchronous) sentinel/
      )
  } else {
    assert.equal(response.type, 'custom-reporter-result')
    assert.equal(response.captureModuleQueued, true)
    assert.equal(response.captureModuleCollected, true)
    assert.equal(response.captureTaskResults, true)
    if (facts.length) {
      child.send({
        type: 'module-queued',
        entry: {
          id: facts[0].entryId,
          file: facts[0].moduleId,
          projectName: facts[0].projectName,
        },
      })
      await waitForTrace((values) =>
        values.some((row) => row.kind === 'first-queued')
      )
      const queued = rows().find((row) => row.kind === 'first-queued')
      assert.equal(queued.specificationIdentity, true)
      assert.equal(queued.projectIdentity, true)
      assert.equal(queued.ok, true)
      assert.deepEqual(queued.meta, {})
      assert.equal(queued.stableMeta, true)
      assert.equal(queued.snapshot.state, 'pending')
      assert.equal(queued.snapshot.children, 0)
    } else {
      const { createTestReporter } = require(
        path.join(dist, 'experimental/testing/reporting/reporter.js')
      )
      const collector = createTestReporter({ projectDir: fixture, write() {} })
      const events = [
        {
          version: 1,
          runId: 'actual-empty-component',
          timestamp: 1,
          type: 'run-start',
          specificationOrder: [],
        },
        {
          version: 1,
          runId: 'actual-empty-component',
          timestamp: 2,
          type: 'run-end',
          status: 'passed',
          durationMs: 0,
        },
      ]
      for (const event of events) collector.onEvent(event)
      const finished = await request({
        type: 'finish',
        completion: { ...collector.getResults(), events, status: 'passed' },
      })
      assert.equal(finished.type, 'custom-reporter-result')
      const firstEnd = rows().find((row) => row.kind === 'first-end')
      assert.equal(firstEnd.argc, 3)
      assert.deepEqual(firstEnd.modules, [])
      assert.deepEqual(firstEnd.errors, [])
      assert.equal(firstEnd.reason, 'passed')
      assert.equal(rows().find((row) => row.kind === 'second-end').argc, 3)
    }
  }
  const shutdown = await request({ type: 'shutdown' })
  assert.equal(shutdown.type, 'custom-reporter-result')
  await joins
  assert.deepEqual(closed, { code: 0, signal: null })
  assert.equal(deadlineFired, false)
  let ownedTargetAbsent = false
  try {
    process.kill(windows ? child.pid : -child.pid, 0)
  } catch (error) {
    ownedTargetAbsent = error.code === 'ESRCH'
  }
  assert.equal(ownedTargetAbsent, true)
  const observed = rows()
  const firstGets = observed.filter((row) => row.kind === 'first-get-start')
  const secondGets = observed.filter((row) => row.kind === 'second-get-start')
  assert.equal(firstGets.length, 1)
  assert.equal(
    secondGets.length,
    ['getter-throw', 'sync-throw'].includes(role) ? 0 : 1
  )
  if (role !== 'getter-throw') {
    const called = observed.find((row) => row.kind === 'first-start')
    assert.equal(called.argc, 1)
    assert.equal(called.receiver, true)
    assert.equal(called.reads, 1)
    assert.equal(called.array, true)
    assert.equal(called.arrayFrozen, false)
    assert.deepEqual(
      called.specifications.map((spec) => spec.moduleId),
      facts.map((fact) => fact.moduleId)
    )
    if (facts.length) {
      assert.equal(called.specsSameProject, true)
      assert.equal(called.specsDifferentProject, true)
      for (const spec of called.specifications) {
        assert.deepEqual(spec.ownKeys, [
          'taskId',
          'project',
          'moduleId',
          'pool',
          'testLines',
          'testNamePattern',
          'testIds',
          'testTagsFilter',
        ])
        assert.equal(spec.testModuleUndefined, true)
        assert.equal(spec.pool, 'forks')
        assert.deepEqual(spec.serializedOptionKeys, [
          'pool',
          'testLines',
          'testIds',
          'testNamePattern',
          'testTagsFilter',
        ])
        assert(
          Object.values(spec.descriptors).every(
            (descriptor) =>
              descriptor.enumerable &&
              descriptor.configurable &&
              descriptor.writable
          )
        )
      }
    }
  }
  assert.equal(observed.filter((row) => row.kind === 'first-close').length, 1)
  assert.equal(observed.filter((row) => row.kind === 'second-close').length, 1)
  assert(
    !observed.some((row) => row.kind === 'evaluate' || row.kind === 'body'),
    'Selected authored test files must never evaluate in this worker-only component'
  )
  for (const [name, pin] of Object.entries(fixturePins))
    assert.equal(hash(path.join(fixture, name)), pin)
  const audits = fs
    .readdirSync(path.join(output, 'guard'))
    .map((name) =>
      JSON.parse(fs.readFileSync(path.join(output, 'guard', name)))
    )
  assert(audits.length >= 1)
  assert.equal(hostGuard.nativeAttempts, 0)
  assert.equal(hostGuard.compilerAttempts.length, 0)
  assert(
    audits.every(
      (audit) =>
        audit.nativeAttempts === 0 && audit.compilerAttempts.length === 0
    )
  )
  Object.assign(summary, {
    success: true,
    exit: closed,
    ownedTargetAbsent,
    groupAbsent: windows ? undefined : ownedTargetAbsent,
    platform: process.platform,
    responseCount,
    rows: observed,
    guardAudits: audits,
    messages,
    scope:
      'Actual selected-fact reporter worker IPC and queued registry identity; no actual runner/compiler/File collection or completed phase proof.',
  })
  fs.writeFileSync(
    path.join(output, 'VERIFIED.json'),
    JSON.stringify(summary, null, 2) + '\n'
  )
  console.log(
    JSON.stringify({
      role,
      node: process.version,
      success: true,
      responseCount,
      firstGetterReads: firstGets.length,
      secondGetterReads: secondGets.length,
      nativeAttempts: 0,
      compilerAttempts: 0,
      ownedTargetAbsent,
      groupAbsent: windows ? undefined : ownedTargetAbsent,
      platform: process.platform,
    })
  )
})()
  .catch(async (error) => {
    try {
      process.kill(windows ? child.pid : -child.pid, 'SIGKILL')
    } catch {}
    await joins
    fs.writeFileSync(
      path.join(output, 'FAILED.json'),
      JSON.stringify(
        {
          ...summary,
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
          exit: closed,
          rows: rows(),
          messages,
        },
        null,
        2
      ) + '\n'
    )
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    clearTimeout(deadline)
    for (const watcher of watchers) fs.unwatchFile(traceFile, watcher)
    fs.closeSync(stdout)
    fs.closeSync(stderr)
  })
