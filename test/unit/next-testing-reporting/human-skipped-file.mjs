import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
require('next/dist/server/node-environment-baseline')
const { initializeTestFile } = require('next/dist/experimental/testing/runner')
const {
  createTestReporter,
} = require('next/dist/experimental/testing/reporting/reporter')
const {
  serializeDiagnostic,
} = require('next/dist/experimental/testing/reporting/diagnostics')
const [mode, output] = process.argv.slice(2),
  directory = mkdtempSync(join(tmpdir(), 'next-human-skipped-')),
  path = join(directory, 'owned.case.mjs'),
  id = 'owned-file',
  effects = [],
  suiteResults = []
writeFileSync(path, '// actual root suite presentation control\n')
let text = '',
  bodies = 0,
  disposed = false
const reporter = createTestReporter({
  projectDir: directory,
  write(value) {
    text += value
  },
  writeError(value) {
    text += value
  },
  color: false,
  isTTY: mode === 'live',
  fileCount: 1,
})
const envelope = { version: 1, runId: 'owned-run', timestamp: 1 },
  emit = (event) => reporter.onEvent({ ...envelope, ...event })
const profile = {
    id: '',
    mode: 'development',
    environment: 'node',
    runtime: 'nodejs',
    bundler: 'turbopack',
  },
  entry = { id, file: path, profile }
const controller = new AbortController(),
  cleanup = new Error('owned actual cleanup failure')
const file = initializeTestFile({
  fileId: id,
  filePath: path,
  publicTaskSelection: true,
  prepareEmptyPublicFile: true,
  finalizePublicTaskModes: true,
  snapshotUpdateMode: 'none',
})
try {
  emit({ type: 'run-start' })
  emit({ type: 'file-start', entry })
  await file.collect(() => {
    const test = file.api.test
      .extend(
        'automaticFile',
        { scope: 'file', auto: true },
        // eslint-disable-next-line no-empty-pattern -- Fixture dependency syntax is intentionally empty.
        ({}, { onCleanup }) => {
          effects.push('file-fixture')
          onCleanup(() => effects.push('file-cleanup'))
          return 1
        }
      )
      .extend(
        'automaticTest',
        { auto: true },
        // eslint-disable-next-line no-empty-pattern -- Fixture dependency syntax is intentionally empty.
        ({}, { onCleanup }) => {
          effects.push('test-fixture')
          onCleanup(() => effects.push('test-cleanup'))
          return 1
        }
      )
    test.beforeAll(() => effects.push('before-all'))
    test.afterAll(() => effects.push('after-all'))
    const body = () => {
      bodies++
      effects.push('body')
      if (mode === 'failed') throw new Error('owned body failure')
    }
    if (mode === 'empty') return
    if (mode === 'passed' || mode === 'failed') test('actual body', body)
    else if (mode === 'todo') test.todo('actual todo')
    else if (mode === 'child-only')
      file.api.describe.skip('actual child', () => test('actual skipped', body))
    else test.skip('actual skipped', body)
  })
  if (mode === 'cancelled')
    controller.abort(new Error('owned actual cancellation'))
  const result = await file.run({
    runId: envelope.runId,
    signal: controller.signal,
    passWithNoTests: mode === 'empty',
    onCaseEnd(actual) {
      emit({
        type: 'case-end',
        ...actual,
        errors: actual.errors.map((f) =>
          serializeDiagnostic(f.error, { phase: 'runtime' })
        ),
      })
    },
    onSuiteEnd(actual) {
      suiteResults.push(actual)
    },
  })
  const root = suiteResults.find((s) => s.suiteId === id)
  if (mode !== 'cancelled') assert(root)
  if (!['passed', 'failed', 'empty', 'cancelled'].includes(mode)) {
    assert.equal(root.status, 'skipped')
    assert.equal(bodies, 0)
    assert.deepEqual(effects, [])
  }
  for (const actual of suiteResults) {
    if (mode === 'no-root' && actual.suiteId === id) continue
    if (mode === 'child-only' && actual.suiteId === id) continue
    const snapshot = {
      ...actual,
      errors: actual.errors.map((f) =>
        serializeDiagnostic(f.error, { phase: 'runtime' })
      ),
    }
    if (mode === 'foreign-root') {
      snapshot.entryId = 'another-file'
      snapshot.suiteId = 'another-file'
    }
    if (mode === 'invalid-ancestry')
      snapshot.ancestors = [{ id: 'not-root', name: 'not root' }]
    if (mode === 'root-error' && actual.suiteId === id)
      snapshot.errors = [
        serializeDiagnostic(new Error('owned root error'), {
          phase: 'runtime',
        }),
      ]
    emit({ type: 'suite-end', ...snapshot })
  }
  if (mode === 'nested-error')
    emit({
      type: 'suite-end',
      entryId: id,
      suiteId: id + '/independent',
      name: 'independent',
      ancestors: [],
      mode: 'run',
      status: 'failed',
      durationMs: 0,
      errors: [
        serializeDiagnostic(new Error('owned independent suite error'), {
          phase: 'runtime',
        }),
      ],
    })
  if (mode === 'file-error' || mode === 'warning')
    emit({
      type: 'diagnostic',
      entryId: id,
      diagnostic: {
        severity: mode === 'warning' ? 'warning' : 'error',
        phase: 'runtime',
        message: 'owned independent file diagnostic',
      },
    })
  let status = result.interrupted
    ? 'cancelled'
    : result.errors.length || result.cases.some((c) => c.status === 'failed')
      ? 'failed'
      : 'passed'
  try {
    await file.dispose(
      mode === 'cleanup-failed'
        ? {
            beforeOwnedWorkerDispose() {
              throw cleanup
            },
          }
        : undefined
    )
    disposed = true
  } catch (error) {
    assert.equal(mode, 'cleanup-failed')
    assert.equal(error, cleanup)
    assert.equal(file.canPublishSnapshots(), false)
    status = 'failed'
    disposed = true
    emit({
      type: 'diagnostic',
      entryId: id,
      diagnostic: serializeDiagnostic(error, { phase: 'cleanup' }),
    })
  }
  emit({ type: 'file-end', entryId: id, status, durationMs: 1 })
  if (mode === 'live') {
    assert(text.includes('Test Files 0 passed | 1 skipped (1)'), text)
    assert.equal(reporter.getSummary().files.passed, 1)
  }
  emit({
    type: 'run-end',
    status:
      status === 'failed' || mode === 'file-error'
        ? 'failed'
        : status === 'cancelled'
          ? 'cancelled'
          : 'passed',
    durationMs: 1,
  })
  const physical = reporter.getResults(),
    summary = reporter.getSummary()
  assert.equal(physical.files[0].status, status)
  assert.equal(summary.files[status], 1)
  assert.equal(
    reporter.getEvents().find((e) => e.type === 'file-end').status,
    status
  )
  const expectedSkipped = ['skipped', 'todo', 'warning', 'live'].includes(mode)
  assert(
    text.includes(
      'Test Files  1 ' + (expectedSkipped ? 'skipped' : status) + ' (1)'
    ),
    text
  )
  if (expectedSkipped) assert(text.includes('↓ '), text)
  if (mode === 'passed' || mode === 'failed') {
    assert.equal(bodies, 1)
    for (const effect of [
      'file-fixture',
      'test-fixture',
      'before-all',
      'after-all',
      'file-cleanup',
      'test-cleanup',
    ])
      assert.equal(effects.filter((e) => e === effect).length, 1, effect)
  } else if (mode === 'empty') {
    assert.equal(bodies, 0)
    assert.equal(effects.filter((e) => e === 'test-fixture').length, 0)
    for (const effect of [
      'file-fixture',
      'before-all',
      'after-all',
      'file-cleanup',
    ])
      assert.equal(effects.filter((e) => e === effect).length, 1, effect)
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        mode,
        actualRootOwned: true,
        bodyInvocations: bodies,
        effects,
        physicalFileStatus: status,
        physicalResultsAndEventsHeld: true,
        presentationOnly: true,
        execPath: process.execPath,
        version: process.version,
        versions: process.versions,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  if (!disposed) await file.dispose()
  await reporter.dispose()
  rmSync(directory, { recursive: true, force: true })
}
