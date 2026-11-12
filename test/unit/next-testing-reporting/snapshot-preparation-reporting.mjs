import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
require('next/dist/server/node-environment-baseline')
const { initializeTestFile } = require('next/dist/experimental/testing/runner')
const {
  captureReporterTaskTree,
} = require('next/dist/experimental/testing/reporting/live-tasks')
const {
  createMachineReporter,
} = require('next/dist/experimental/testing/reporting/machine')
const {
  captureSnapshotPreparationFailure,
} = require('next/dist/experimental/testing/execution/snapshot-preparation')
const [mode, output] = process.argv.slice(2)
const directory = mkdtempSync(join(tmpdir(), 'next-snapshot-reporting-'))
const path = join(directory, 'owned.case.mjs'),
  snapshotPath = join(directory, '__snapshots__', 'owned.case.mjs.snap')
mkdirSync(join(directory, '__snapshots__'))
writeFileSync(path, '// owned actual file\n')
writeFileSync(snapshotPath, '// Vitest Snapshot v1\n')
const owner = {
  runId: 'owned-run',
  entryId: 'owned-file',
  revision: 'owned-revision',
}
const descriptor = Object.getOwnPropertyDescriptor(fs.promises, 'readFile'),
  originalRead = fs.promises.readFile
const original =
  mode === 'undefined'
    ? undefined
    : new Error('owned real snapshot preparation error')
Object.defineProperty(fs.promises, 'readFile', {
  ...descriptor,
  value: async function (file, ...args) {
    if (file === snapshotPath) throw original
    return Reflect.apply(originalRead, this, [file, ...args])
  },
})
let bodies = 0,
  tree,
  file,
  machine
try {
  file = initializeTestFile({
    fileId: owner.entryId,
    filePath: path,
    preparePublicSnapshots: true,
    snapshotUpdateMode: 'none',
  })
  await file.collect(() => {
    const register = () =>
      file.api.test('declared but never started', () => {
        bodies++
      })
    if (mode === 'nested') file.api.describe('owned suite', register)
    else register()
  })
  let rejected = false
  try {
    await file.run({
      runId: owner.runId,
      signal: new AbortController().signal,
      onCollected(actual) {
        tree = captureReporterTaskTree(actual)
      },
    })
  } catch (error) {
    rejected = true
    assert.equal(error, original)
  }
  assert(rejected)
  assert.equal(bodies, 0)
  assert(tree)
  assert.equal(tree.result, undefined)
  const fact = file.getSnapshotPreparationFailure()
  assert(fact)
  assert.equal(fact.error, original)
  assert.equal(fact.propagatedThroughRun, true)
  await file.dispose()
  const failure = captureSnapshotPreparationFailure(
    fact.error,
    owner,
    fact.source
  )
  machine = createMachineReporter({
    projectDir: directory,
    reporters: ['json'],
    collect: true,
    ...(mode === 'reentrant-event'
      ? {
          customReporterSession: {
            onEvent(event) {
              if (event.type === 'diagnostic')
                machine.onEvent({
                  version: 1,
                  runId: owner.runId,
                  timestamp: 1,
                  type: 'output',
                  entryId: owner.entryId,
                  revision: owner.revision,
                  stream: 'stdout',
                  text: 'real reentrant observer output',
                })
            },
            onSnapshotPreparationFailure() {},
            async dispose() {},
          },
        }
      : {}),
    write() {},
  })
  await machine.initialize()
  const envelope = { version: 1, runId: owner.runId, timestamp: 1 }
  const emit = (event) => machine.onEvent({ ...envelope, ...event })
  const entry = {
    id: owner.entryId,
    file: path,
    profile: {
      id: 'owned',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    },
  }
  emit({ type: 'run-start' })
  emit({ type: 'file-start', entry, revision: owner.revision })
  emit({
    type: 'file-collected',
    entryId: owner.entryId,
    revision: owner.revision,
    taskTree: tree,
  })
  let delivered
  if (failure.outcome.kind === 'error') {
    delivered = {
      ...envelope,
      type: 'diagnostic',
      diagnostic: failure.outcome.diagnostic,
    }
    if (mode !== 'missing-event') machine.onEvent(delivered)
  }
  if (mode === 'event-before-case')
    emit({
      type: 'case-start',
      entryId: owner.entryId,
      revision: owner.revision,
      caseId: tree.tasks[0].id,
      name: tree.tasks[0].name,
      mode: 'run',
      attempt: { id: 'actual-attempt', retry: 0, repeat: 0 },
    })
  if (mode === 'late-diagnostic')
    emit({
      type: 'output',
      entryId: owner.entryId,
      revision: owner.revision,
      stream: 'stdout',
      text: 'actual intervening event',
    })
  if (
    [
      'copy-event',
      'missing-event',
      'foreign-owner',
      'event-before-case',
      'late-diagnostic',
    ].includes(mode)
  ) {
    assert.throws(
      () =>
        machine.onSnapshotPreparationFailure(
          mode === 'foreign-owner'
            ? { ...failure, revision: 'foreign' }
            : failure,
          mode === 'copy-event' ? structuredClone(delivered) : delivered
        ),
      /actual delivered|actual execution|Invalid owned/
    )
  } else {
    machine.onSnapshotPreparationFailure(failure, delivered)
    if (mode === 'duplicate')
      assert.throws(
        () => machine.onSnapshotPreparationFailure(failure, delivered),
        /actual one-shot/
      )
    if (mode.startsWith('post-')) {
      const event =
        mode === 'post-case'
          ? {
              type: 'case-start',
              caseId: tree.tasks[0].id,
              name: 'declared but never started',
              mode: 'run',
              attempt: { id: 'contradiction', retry: 0, repeat: 0 },
            }
          : mode === 'post-tree'
            ? { type: 'task-update', taskTree: tree }
            : { type: 'snapshot-summary', summary: {} }
      assert.throws(
        () =>
          emit({ ...event, entryId: owner.entryId, revision: owner.revision }),
        /Execution facts follow/
      )
    }
    if (mode === 'independent-file-error')
      emit({
        type: 'diagnostic',
        entryId: owner.entryId,
        revision: owner.revision,
        diagnostic: {
          severity: 'error',
          phase: 'runtime',
          message: 'owned independent disposal error',
        },
      })
    emit({
      type: 'file-end',
      entryId: owner.entryId,
      revision: owner.revision,
      status: mode === 'undefined' ? 'passed' : 'failed',
      durationMs: 1,
    })
    emit({
      type: 'run-end',
      status: mode === 'undefined' ? 'passed' : 'failed',
      durationMs: 1,
    })
    const json = machine.getJson()
    assert.equal(json.numTotalTests, 1)
    assert.equal(json.numPassedTests, 0)
    assert.equal(json.numFailedTests, 0)
    assert.equal(json.numPendingTests, 0)
    assert.equal(json.testResults[0].assertionResults[0].status, 'pending')
    assert.equal(json.testResults[0].assertionResults[0].duration, undefined)
    assert.deepEqual(
      json.testResults[0].assertionResults[0].ancestorTitles,
      mode === 'nested' ? ['owned suite'] : []
    )
    assert.equal(
      json.testResults[0].assertionResults[0].fullName,
      (mode === 'nested' ? 'owned suite ' : '') + 'declared but never started'
    )
    assert.equal(json.success, mode !== 'independent-file-error')
    assert.equal(
      json.testResults[0].status,
      mode === 'independent-file-error' ? 'failed' : 'passed'
    )
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        mode,
        actualPreparationFailed: true,
        bodyInvocations: bodies,
        actualReceivedEventAssociation: true,
        contradictionsRejected: true,
        execPath: process.execPath,
        version: process.version,
        versions: process.versions,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  Object.defineProperty(fs.promises, 'readFile', descriptor)
  await file?.dispose()
  await machine?.dispose()
  rmSync(directory, { recursive: true, force: true })
}
