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
  createTestReporter,
} = require('next/dist/experimental/testing/reporting/reporter')
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
  let text = '',
    reentered = false,
    inDiagnostic = false
  const independent = new Error('owned independent renderer cleanup')
  const {
    createTestTerminal,
  } = require('next/dist/experimental/testing/reporting/terminal')
  const write = (value) => {
    text += value
    if (mode === 'write-throw' && value.includes('owned failing output'))
      throw independent
  }
  const terminal = createTestTerminal({ write, isTTY: false })
  const resume = terminal.resume
  terminal.resume = function () {
    if (mode === 'reentrant' && inDiagnostic && !reentered) {
      reentered = true
      machine.onEvent({
        ...envelope,
        type: 'output',
        entryId: owner.entryId,
        stream: 'stdout',
        text: 'owned nested output',
      })
    }
    return Reflect.apply(resume, this, [])
  }
  machine = createTestReporter({
    projectDir: directory,
    ...(mode === 'omitted' ? {} : { preparePublicSnapshots: true }),
    ...(mode === 'tty' ? { isTTY: true } : {}),
    color: false,
    write,
    writeError: write,
    terminal,
  })
  const envelope = { version: 1, runId: owner.runId, timestamp: 1 }
  const entry = {
    id: owner.entryId,
    file: path,
    profile: {
      id: '',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    },
  }
  machine.onEvent({ ...envelope, type: 'run-start' })
  machine.onEvent({
    ...envelope,
    type: 'file-start',
    entry,
    revision: owner.revision,
  })
  if (mode !== 'missing-collected')
    machine.onEvent({
      ...envelope,
      type: 'file-collected',
      entryId: owner.entryId,
      revision: owner.revision,
      taskTree: tree,
    })
  const diagnostic =
    failure.outcome.kind === 'error'
      ? {
          ...envelope,
          type: 'diagnostic',
          diagnostic: failure.outcome.diagnostic,
        }
      : undefined
  if (diagnostic) {
    inDiagnostic = true
    try {
      machine.onEvent(diagnostic)
    } finally {
      inDiagnostic = false
    }
  }
  if (mode === 'write-throw')
    assert.throws(
      () =>
        machine.onEvent({
          ...envelope,
          type: 'output',
          entryId: owner.entryId,
          stream: 'stdout',
          text: 'owned failing output',
        }),
      (error) => error === independent
    )
  const delivered =
    mode === 'copied-diagnostic' && diagnostic
      ? structuredClone(diagnostic)
      : diagnostic
  const accepted = ![
    'omitted',
    'tty',
    'missing-collected',
    'copied-diagnostic',
    'write-throw',
  ].includes(mode)
  if (!accepted) {
    assert.throws(
      () => machine.onSnapshotPreparationFailure(failure, delivered),
      /Human preparation|Human snapshot|Human preparation|one-shot owner/
    )
  } else {
    machine.onSnapshotPreparationFailure(failure, delivered)
    assert.throws(
      () => machine.onSnapshotPreparationFailure(failure, delivered),
      /one-shot owner/
    )
    if (mode === 'late-case')
      assert.throws(
        () =>
          machine.onEvent({
            ...envelope,
            type: 'case-start',
            entryId: owner.entryId,
            revision: owner.revision,
            caseId: 'forbidden',
            name: 'forbidden',
            ancestors: [],
            mode: 'run',
            attempt: { id: 'forbidden', retry: 0, repeat: 0 },
          }),
        /Execution follows/
      )
    else {
      if (mode === 'cleanup')
        machine.onEvent({
          ...envelope,
          type: 'diagnostic',
          entryId: owner.entryId,
          diagnostic: {
            severity: 'error',
            phase: 'cleanup',
            name: 'Error',
            message: independent.message,
          },
        })
      // These terminal control inputs match the retained real worker receipts;
      // only direct-runTests public probes establish the producer projection.
      machine.onEvent({
        ...envelope,
        type: 'file-end',
        entryId: owner.entryId,
        status: original === undefined ? 'passed' : 'failed',
        durationMs: 1,
      })
      machine.onEvent({
        ...envelope,
        type: 'run-end',
        status: original === undefined ? 'passed' : 'failed',
        durationMs: 1,
      })
      assert(
        text.includes(
          mode === 'cleanup' ? 'Test Files  1 failed (1)' : 'Test Files   (1)'
        ),
        text
      )
      assert(text.includes('Tests   (1)'), text)
      const results = machine.getResults(),
        events = machine.getEvents()
      assert.equal(
        results.files[0].status,
        original === undefined ? 'passed' : 'failed'
      )
      assert.equal(
        events.filter(
          (event) => event.type === 'case-start' || event.type === 'case-end'
        ).length,
        0
      )
      if (original !== undefined) assert(text.includes('Test Run Error'), text)
      else assert(!text.includes('Test Run Error'), text)
      if (mode === 'cleanup') assert(text.includes(independent.message), text)
      if (mode === 'reentrant') assert(reentered)
    }
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        mode,
        accepted,
        realPreparation: true,
        bodies,
        physicalEvidenceUnchanged: true,
        version: process.version,
        execPath: process.execPath,
        versions: process.versions,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  if (machine) await machine.dispose()
  Object.defineProperty(fs.promises, 'readFile', descriptor)
  if (file) await file.dispose()
  rmSync(directory, { recursive: true, force: true })
}
