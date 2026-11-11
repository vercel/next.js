import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  copyFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
const require = createRequire(import.meta.url)
require('next/dist/server/node-environment-baseline')
const { initializeTestFile } = require('next/dist/experimental/testing/runner')
const {
  createReporterTaskUpdates,
} = require('next/dist/experimental/testing/reporting/task-updates')
const {
  captureReporterTaskTree,
} = require('next/dist/experimental/testing/reporting/live-tasks')
const {
  createMachineReporter,
} = require('next/dist/experimental/testing/reporting/machine')
const {
  serializeDiagnostic,
} = require('next/dist/experimental/testing/reporting/diagnostics')
const [mode, output] = process.argv.slice(2),
  failed = mode.startsWith('failed'),
  requested = mode !== 'absent' && !mode.endsWith('-baseline'),
  getter = mode.startsWith('getter-')
const root = mkdtempSync(join(tmpdir(), 'next-module-start-consumer-')),
  trace = join(root, 'trace.jsonl'),
  release = join(root, 'release'),
  filePath = join(root, 'case.mjs')
writeFileSync(trace, '')
writeFileSync(filePath, '// actual component file\n')
writeFileSync(join(root, 'mode.json'), JSON.stringify({ mode, trace, release }))
copyFileSync(
  new URL('./fixtures/module-start-reporter.mjs', import.meta.url),
  join(root, 'reporter.mjs')
)
const entry = {
    id: 'actual-component-file',
    file: filePath,
    profile: {
      id: 'node',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    },
  },
  runId = 'component-run',
  revision = 'component-fixture-revision'
const machine = createMachineReporter({
  projectDir: root,
  reporters: ['json', join(root, 'reporter.mjs')],
  collect: true,
  write() {},
})
const emit = (event) =>
  machine.onEvent({ version: 1, runId, timestamp: Date.now(), ...event })
const diagnostic = (f) =>
  serializeDiagnostic(f.error, {
    phase: f.phase === 'cleanup' ? 'cleanup' : 'runtime',
  })
const errorGetterCounts = { name: 0, message: 0, stack: 0 }
const originalError = new Error('owned getter failure')
for (const key of Object.keys(errorGetterCounts))
  Object.defineProperty(originalError, key, {
    configurable: true,
    get() {
      errorGetterCounts[key]++
      return key === 'name'
        ? 'Error'
        : key === 'message'
          ? 'owned getter failure'
          : 'Error: owned getter failure\n    at owned (/owned/module-start.mjs:1:1)'
    },
  })
let file,
  updates,
  finishFailure,
  finishRejected = false,
  finished = false,
  metaReads = 0,
  startedResult,
  completion
const rows = () =>
  readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
async function until(check) {
  const end = Date.now() + 10000
  while (Date.now() < end) {
    if (check()) return
    assert(
      !finished || rows().some((r) => r.event === 'run-end'),
      'completion closed before requested marker'
    )
    await delay(5)
  }
  throw new Error('original component10000ms marker deadline')
}
try {
  await machine.initialize()
  assert.equal(machine.captureModuleStart, requested)
  assert.equal(machine.captureModuleCollected, true)
  emit({ type: 'run-start' })
  emit({ type: 'file-start', entry, revision })
  updates = createReporterTaskUpdates({
    ...(requested ? { captureModuleStart: true } : {}),
    onUpdate(update) {
      emit({ type: 'task-update', entryId: entry.id, revision, ...update })
    },
  })
  file = initializeTestFile({
    fileId: entry.id,
    filePath,
    preparePublicSnapshots: true,
    prepareEmptyPublicFile: true,
    finalizePublicTaskModes: true,
    snapshotUpdateMode: 'none',
  })
  let body = 0
  await file.collect(async () => {
    if (getter)
      file.api.beforeAll(() => {
        throw originalError
      })
    if (!failed)
      file.api.test('actual body', () => {
        body++
      })
  })
  const result = await file.run({
    runId,
    signal: new AbortController().signal,
    ...(requested
      ? {
          captureModuleStart: true,
          onFilePrepared(actual) {
            startedResult = actual.result
            updates.filePrepared(actual)
          },
        }
      : {}),
    onCollected(actual) {
      const meta = actual.meta
      Object.defineProperty(actual, 'meta', {
        configurable: true,
        get() {
          metaReads++
          return meta
        },
      })
      emit({
        type: 'file-collected',
        entryId: entry.id,
        revision,
        taskTree: captureReporterTaskTree(actual),
      })
      updates.collected(actual)
    },
    onCaseStart(ctx) {
      if (requested) updates.caseStart(ctx.testId)
      emit({
        type: 'case-start',
        entryId: entry.id,
        caseId: ctx.testId,
        attempt: { id: ctx.id, retry: ctx.retry, repeat: ctx.repeat },
        revision,
      })
    },
    onCaseEnd(test) {
      emit({
        type: 'case-end',
        ...test,
        revision,
        errors: test.errors.map(diagnostic),
      })
    },
    onCaseResult(task, test) {
      updates.caseResult(task, {
        ...test,
        revision,
        errors: test.errors.map(diagnostic),
      })
    },
    onSuiteEnd(suite, task) {
      emit({
        type: 'suite-end',
        ...suite,
        revision,
        errors: suite.errors.map(diagnostic),
      })
      updates.suiteEnd(task)
    },
  })
  await updates.finish()
  await file.dispose()
  file = undefined
  const status =
    result.errors.length || result.cases.some((t) => t.status === 'failed')
      ? 'failed'
      : 'passed'
  emit({ type: 'file-end', entryId: entry.id, status, durationMs: 0 })
  emit({ type: 'run-end', status, durationMs: 0 })
  completion = machine.finish().then(
    () => {
      finished = true
    },
    (error) => {
      finishRejected = true
      finishFailure = error
      finished = true
    }
  )
  if (requested) {
    await until(() => rows().some((r) => r.event === 'start'))
    if (!failed) await until(() => rows().some((r) => r.event === 'end'))
  }
  writeFileSync(release, 'release')
  await completion
  const actual = rows(),
    start = actual.find((r) => r.event === 'start'),
    end = actual.find((r) => r.event === 'end'),
    run = actual.find((r) => r.event === 'run-end')
  assert.equal(body, failed || getter ? 0 : 1)
  assert.equal(run.reason, status)
  if (requested) {
    assert.equal(start.sameCollected, true)
    assert.equal(start.state, failed ? 'failed' : 'pending')
    assert(startedResult)
    assert.equal(actual.filter((r) => r.event === 'start').length, 1)
  } else assert.equal(start, undefined)
  const rejected = mode.endsWith('-error') || mode.endsWith('-undefined')
  assert.equal(finishRejected, rejected)
  if (rejected) {
    assert.equal(run.errors.length, 1)
    if (mode.endsWith('-undefined')) assert.deepEqual(run.errors, [{}])
    else assert.equal(run.errors[0].message, 'owned Start callback failure')
  } else assert.deepEqual(run.errors, [])
  if (failed && rejected) assert.equal(end, undefined)
  else {
    assert(end)
    assert.equal(end.sameCollected, true)
    if (requested && mode !== 'fulfilled')
      assert(
        actual.findIndex(
          (r) => r.event === (!failed ? 'end' : 'start-return')
        ) <
          actual.findIndex(
            (r) => r.event === (!failed ? 'start-return' : 'end')
          )
      )
  }
  const json = machine.getJson()
  if (!getter) {
    assert.equal(json.numPassedTests, failed ? 0 : 1)
    assert.equal(json.numFailedTests, 0)
  }
  assert.equal(json.success, !failed && !getter)
  writeFileSync(
    output,
    JSON.stringify(
      {
        mode,
        rows: actual,
        body,
        metaReads,
        errorGetterCounts,
        physicalCounts: Object.fromEntries(
          Object.entries(json).filter(
            ([key]) => key.startsWith('num') || key === 'success'
          )
        ),
        actualFileResultHeld: true,
        realCallbackPromisesJoined: true,
        physicalJSONUnchanged: true,
        finishRejected,
        runtime: { execPath: process.execPath, versions: process.versions },
      },
      null,
      2
    ) + '\n'
  )
} finally {
  writeFileSync(release, 'release')
  await completion
  updates?.dispose()
  await file?.dispose()
  await machine.dispose(
    finishRejected ? { handledCustomFailure: finishFailure } : {}
  )
  rmSync(root, { recursive: true, force: true })
}
