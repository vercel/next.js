import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
const [output, installedConsumer] = process.argv.slice(2)
const require = createRequire(
  join(
    installedConsumer ??
      resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
    'package.json'
  )
)
require('next/dist/server/node-environment-baseline')
const {
  captureJUnitSuiteTask,
  assertJUnitSuiteObservation,
  assertJUnitSuiteRole,
} = require('next/dist/experimental/testing/reporting/junit-suites')
const {
  createMachineReporter,
} = require('next/dist/experimental/testing/reporting/machine')
if (installedConsumer)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => require.resolve(name), { code: 'MODULE_NOT_FOUND' })
const projectDir = '/actual-junit-project'
const entry = {
  id: 'entry',
  file: projectDir + '/owned.case.mjs',
  profile: {
    id: 'node',
    mode: 'development',
    environment: 'node',
    runtime: 'nodejs',
    bundler: 'turbopack',
  },
}
const envelope = {
  version: 1,
  runId: 'actual-run',
  revision: 'actual-revision',
  timestamp: 100,
}
const diagnostic = {
  severity: 'error',
  phase: 'runtime',
  name: 'Error',
  message: 'owned hook error',
  stack: 'Error: owned hook error\n    at actual-compiled.js:5:3',
  frames: [
    {
      file: 'file://' + entry.file,
      line: 5,
      column: 3,
      methodName: '<unknown>',
      original: true,
    },
  ],
}
function pair(count = 1) {
  const suite = {
    entryId: entry.id,
    suiteId: entry.id,
    name: '',
    ancestors: [],
    mode: 'run',
    status: 'failed',
    durationMs: 12.345678901234,
    errors: Array.from({ length: count }, () => structuredClone(diagnostic)),
  }
  const task = {
    id: entry.id,
    name: 'owned.case.mjs',
    type: 'suite',
    mode: 'run',
    result: {
      state: 'fail',
      duration: 12.345678901234,
      errors: suite.errors.map(({ name, message, stack }) => ({
        name,
        message,
        stack,
      })),
    },
  }
  return { suite, task }
}
let controls = 0
const pass = (fn) => {
  fn()
  controls++
}
pass(() => {
  const { suite, task } = pair(2)
  const fact = captureJUnitSuiteTask(task, suite)
  assert(fact)
  assert.equal(fact.errors.length, 2)
  assert.deepEqual(fact.errors[0], fact.errors[1])
  assert.notEqual(fact.errors[0], fact.errors[1])
  assertJUnitSuiteObservation({ ...suite, reportedTask: fact }, true)
})
pass(() => {
  const { suite, task } = pair()
  let reads = 0
  Object.defineProperty(task, 'meta', {
    get() {
      reads++
      throw Error('meta read')
    },
  })
  assert(captureJUnitSuiteTask(task, suite))
  assert.equal(reads, 0)
})
for (const key of ['id', 'name', 'type', 'mode', 'result'])
  pass(() => {
    const { suite, task } = pair()
    let reads = 0
    Object.defineProperty(task, key, {
      get() {
        reads++
        throw Error('getter read')
      },
    })
    assert.equal(captureJUnitSuiteTask(task, suite), undefined)
    assert.equal(reads, 0)
  })
for (const key of ['state', 'duration', 'errors'])
  pass(() => {
    const { suite, task } = pair()
    let reads = 0
    Object.defineProperty(task.result, key, {
      get() {
        reads++
        throw Error('getter read')
      },
    })
    assert.equal(captureJUnitSuiteTask(task, suite), undefined)
    assert.equal(reads, 0)
  })
for (const key of ['name', 'message', 'stack'])
  pass(() => {
    const { suite, task } = pair()
    let reads = 0
    Object.defineProperty(task.result.errors[0], key, {
      get() {
        reads++
        throw Error('getter read')
      },
    })
    assert.equal(captureJUnitSuiteTask(task, suite), undefined)
    assert.equal(reads, 0)
  })
pass(() => {
  const { suite, task } = pair()
  let reads = 0
  Object.defineProperty(task.result.errors, '0', {
    get() {
      reads++
      throw Error('index read')
    },
  })
  assert.equal(captureJUnitSuiteTask(task, suite), undefined)
  assert.equal(reads, 0)
})
for (const level of ['task', 'result', 'errors', 'error'])
  pass(() => {
    const { suite, task } = pair()
    let traps = 0
    const proxy = (value) =>
      new Proxy(value, {
        get() {
          traps++
          throw Error('proxy get')
        },
        getOwnPropertyDescriptor() {
          traps++
          throw Error('proxy descriptor')
        },
        ownKeys() {
          traps++
          throw Error('proxy keys')
        },
      })
    let actual = task
    if (level === 'task') actual = proxy(task)
    if (level === 'result') task.result = proxy(task.result)
    if (level === 'errors') task.result.errors = proxy(task.result.errors)
    if (level === 'error') task.result.errors[0] = proxy(task.result.errors[0])
    assert.equal(captureJUnitSuiteTask(actual, suite), undefined)
    assert.equal(traps, 0)
  })
pass(() => {
  const { suite, task } = pair()
  let iterations = 0
  task.result.errors[Symbol.iterator] = () => {
    iterations++
    throw Error('iterator')
  }
  assert(captureJUnitSuiteTask(task, suite))
  assert.equal(iterations, 0)
})
for (const change of [
  (t) => (t.id = 'foreign'),
  (t) => (t.result.state = 'pass'),
  (t) => (t.result.duration = Infinity),
  (t) => (t.result.errors[0].cause = {}),
  (t) => (t.result.errors[0].stack = 'foreign'),
])
  pass(() => {
    const { suite, task } = pair()
    change(task)
    assert.equal(captureJUnitSuiteTask(task, suite), undefined)
  })
pass(() => {
  const { suite, task } = pair()
  const fact = captureJUnitSuiteTask(task, suite)
  assert.throws(
    () => assertJUnitSuiteObservation({ ...suite, reportedTask: fact }, false),
    /unrequested/
  )
  assert.throws(
    () =>
      assertJUnitSuiteObservation(
        { ...suite, reportedTask: { ...fact, extra: true } },
        true
      ),
    /Invalid/
  )
  assert.throws(
    () =>
      assertJUnitSuiteObservation(
        { ...suite, reportedTask: { ...fact, id: 'foreign' } },
        true
      ),
    /Invalid/
  )
})
const machines = []
function build({
  requested = true,
  count = 1,
  independent = false,
  missing = false,
  foreign = false,
} = {}) {
  const machine = createMachineReporter({
    projectDir,
    reporters: ['junit'],
    write() {},
    ...(requested ? { captureJUnitSuiteTasks: true } : {}),
  })
  machines.push(machine)
  const { suite, task } = pair(count)
  const fact = captureJUnitSuiteTask(task, suite)
  machine.onEvent({ ...envelope, type: 'run-start' })
  machine.onEvent({ ...envelope, type: 'file-start', entry })
  machine.onEvent({
    ...envelope,
    type: 'case-end',
    entryId: entry.id,
    caseId: 'case',
    attempt: { id: 'attempt', retry: 0, repeat: 0 },
    name: 'blocked',
    mode: 'skip',
    status: 'skipped',
    durationMs: 0,
    errors: [],
  })
  machine.onEvent({
    ...envelope,
    type: 'suite-end',
    ...suite,
    ...(!missing ? { reportedTask: fact } : {}),
    ...(foreign ? { revision: 'foreign' } : {}),
  })
  suite.errors.forEach((error, index) =>
    machine.onEvent({
      ...envelope,
      type: 'diagnostic',
      entryId: entry.id,
      suiteError: { suiteId: suite.suiteId, index },
      diagnostic: error,
    })
  )
  if (independent)
    machine.onEvent({
      ...envelope,
      type: 'diagnostic',
      entryId: entry.id,
      diagnostic: {
        ...diagnostic,
        message: 'independent cleanup',
        phase: 'cleanup',
      },
    })
  machine.onEvent({
    ...envelope,
    type: 'file-end',
    entryId: entry.id,
    status: 'failed',
    durationMs: 100,
  })
  machine.onEvent({
    ...envelope,
    type: 'run-end',
    status: 'failed',
    durationMs: 100,
  })
  return machine
}
try {
  pass(() => {
    const machine = build({ count: 2 })
    const before = JSON.stringify(machine.getJson())
    const xml = machine.getJUnit()
    assert.match(xml, /tests="2" failures="1" errors="0" skipped="1"/)
    assert.equal((xml.match(/<failure /g) || []).length, 2)
    assert.match(xml, /name="owned.case.mjs" time="0.0123456789"/)
    assert.match(xml, /Error: owned hook error\n ❯ owned.case.mjs:5:3/)
    assert(!xml.includes('[file error]'))
    assert.equal(JSON.stringify(machine.getJson()), before)
  })
  pass(() => {
    const xml = build({ independent: true }).getJUnit()
    assert.match(xml, /tests="3" failures="1" errors="1" skipped="1"/)
    assert(xml.includes('independent cleanup'))
  })
  pass(() => {
    const xml = build({ missing: true }).getJUnit()
    assert.match(xml, /failures="0" errors="1"/)
    assert(xml.includes('[file error]'))
  })
  pass(() => assert.throws(() => build({ requested: false }), /unrequested/))
  pass(() =>
    assert.throws(() => build({ foreign: true }), /actual started file owner/)
  )
  const artifact = { kind: 'node', profile: entry.profile }
  const options = { captureJUnitSuiteTasks: true, entry }
  pass(() => assertJUnitSuiteRole(artifact, options))
  for (const fields of [
    { captureJUnitSuiteTasks: 'true' },
    { coverage: {} },
    { customCoverage: {} },
    { collectOnly: true },
    { inspect: 'localhost' },
    { userCancelSignal: new AbortController().signal },
  ])
    pass(() =>
      assert.throws(
        () => assertJUnitSuiteRole(artifact, { ...options, ...fields }),
        /actual one-shot/
      )
    )
  pass(() => assertJUnitSuiteRole({ kind: 'browser' }, { entry }))
  const result = {
    controls,
    status: 'passed',
    version: process.version,
    versions: process.versions,
    execPath: process.execPath,
    installed: !!installedConsumer,
  }
  if (output) writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
} finally {
  await Promise.all(machines.map((machine) => machine.dispose()))
}
