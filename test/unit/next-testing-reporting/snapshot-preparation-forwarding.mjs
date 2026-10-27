import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
require('next/dist/server/node-environment-baseline')
const {
  captureSnapshotPreparationFailure,
} = require('next/dist/experimental/testing/execution/snapshot-preparation')
const { normalizeTestConfig } = require('next/dist/experimental/testing/config')
const previousNodeEnv = process.env.NODE_ENV
process.env.NODE_ENV = 'development'
const [mode, output] = process.argv.slice(2),
  directory = mkdtempSync(join(tmpdir(), 'next-snapshot-forwarding-'))
const source = join(directory, 'owned.case.mjs')
writeFileSync(source, '// actual transport control\n')
const project = {
  ...normalizeTestConfig({ test: { include: ['*.case.mjs'] } }).projects[0],
  entries: [],
}
const entry = { id: 'owned-entry', file: source, profile: project.profile }
project.entries.push(entry)
const tree = {
  id: entry.id,
  type: 'suite',
  name: 'owned.case.mjs',
  filepath: source,
  fullName: '',
  mode: 'run',
  meta: {},
  tags: [],
  projectName: '',
  tasks: [],
}
let joined = false,
  invoked = 0,
  diagnostics = [],
  rejected = false,
  error,
  result
const shared = new Error('owned delivered preparation error'),
  consumerError = new Error('owned independent consumer error')
const file = require.resolve('next/dist/experimental/testing/watch-process')
const previous = require.cache[file]
require.cache[file] = {
  id: file,
  filename: file,
  loaded: true,
  exports: {
    WatchOwnershipError: class extends Error {},
    async runWatchProcess(request, options) {
      try {
        assert.equal(request.preparePublicSnapshots, true)
        const envelope = { version: 1, runId: 'actual-child-run', timestamp: 1 }
        options.onEvent({ ...envelope, type: 'run-start' })
        options.onEvent({
          ...envelope,
          type: 'file-start',
          entry,
          revision: 'actual-revision',
        })
        options.onEvent({
          ...envelope,
          type: 'file-collected',
          entryId: entry.id,
          revision: 'actual-revision',
          taskTree: tree,
        })
        options.onSnapshotPreparationFailure(
          captureSnapshotPreparationFailure(
            mode === 'undefined' ? undefined : shared,
            {
              runId: envelope.runId,
              entryId: entry.id,
              revision: 'actual-revision',
            },
            'run'
          )
        )
        options.onEvent({
          ...envelope,
          type: 'file-end',
          entryId: entry.id,
          revision: 'actual-revision',
          status: mode === 'undefined' ? 'passed' : 'failed',
          durationMs: 1,
        })
        return {
          operation: 'run',
          result: {
            status: mode === 'undefined' ? 'passed' : 'failed',
            unsafeCleanup: false,
          },
        }
      } finally {
        joined = true
      }
    },
  },
}
try {
  const { runTests } = require('next/dist/experimental/testing/orchestrator')
  const options = {
    signal: new AbortController().signal,
    write() {},
    isolateProjects: true,
    preparePublicSnapshots: true,
    onEvent(event) {
      if (event.type !== 'diagnostic') return
      diagnostics.push(event)
      if (
        event.entryId !== undefined ||
        event.diagnostic.message !== shared.message
      )
        return
      if (mode === 'on-event-throw') throw consumerError
      // eslint-disable-next-line no-throw-literal -- Exact undefined observer rejection.
      if (mode === 'on-event-throw-undefined') throw undefined
      if (mode === 'on-event-reject') return Promise.reject(consumerError)
      if (mode === 'on-event-reject-undefined') return Promise.reject(undefined)
      if (mode === 'on-event-fulfill') return Promise.resolve()
    },
    onSnapshotPreparationFailure(failure, delivered) {
      invoked++
      assert.notEqual(failure.runId, 'actual-child-run')
      assert.equal(failure.entryId, entry.id)
      assert.equal(failure.revision, 'actual-revision')
      if (mode === 'undefined') assert.equal(delivered, undefined)
      else {
        assert.equal(delivered, diagnostics.at(-1))
        assert.equal(delivered.diagnostic, failure.outcome.diagnostic)
        assert.equal(delivered.entryId, undefined)
      }
      if (mode === 'consumer-throw') throw consumerError
      // eslint-disable-next-line no-throw-literal -- Exact undefined observer rejection.
      if (mode === 'consumer-throw-undefined') throw undefined
      if (mode === 'consumer-reject') return Promise.reject(consumerError)
      if (mode === 'consumer-reject-undefined') return Promise.reject(undefined)
      if (mode === 'consumer-fulfill') return Promise.resolve()
    },
  }
  if (mode === 'missing') delete options.onSnapshotPreparationFailure
  try {
    result = await runTests(directory, [project], options)
  } catch (caught) {
    rejected = true
    error = caught
  }
  if (mode === 'missing') {
    assert(rejected)
    assert.equal(joined, false)
    assert.equal(invoked, 0)
  } else {
    assert.equal(joined, true)
    if (mode.startsWith('on-event-')) {
      assert(rejected)
      assert.equal(invoked, 0)
    } else assert.equal(invoked, 1)
    if (
      mode === 'on-event-throw-undefined' ||
      mode === 'on-event-reject-undefined' ||
      mode === 'consumer-reject-undefined'
    )
      assert.equal(error, undefined)
    if (
      mode === 'on-event-throw' ||
      mode === 'on-event-reject' ||
      mode === 'consumer-reject'
    )
      assert.equal(error, consumerError)
    if (mode === 'on-event-fulfill' || mode === 'consumer-fulfill')
      assert.match(error.message, /requires a synchronous observer/)
    if (mode === 'consumer-throw' || mode === 'consumer-throw-undefined') {
      assert(rejected || result.status === 'failed')
      assert(
        diagnostics.some(
          (event) =>
            event.diagnostic.message ===
            (mode === 'consumer-throw'
              ? 'owned independent consumer error'
              : 'undefined')
        )
      )
    }
    if (mode === 'sync' || mode === 'undefined') assert.equal(rejected, false)
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        mode,
        actualForwardingOwnerMappedOnce: true,
        physicalMockOwnerJoined: joined,
        callbackInvocations: invoked,
        rejected,
        failureKind: rejected
          ? error === undefined
            ? 'undefined'
            : 'error'
          : 'none',
        execPath: process.execPath,
        version: process.version,
        versions: process.versions,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = previousNodeEnv
  if (previous) require.cache[file] = previous
  else delete require.cache[file]
  rmSync(directory, { recursive: true, force: true })
}
