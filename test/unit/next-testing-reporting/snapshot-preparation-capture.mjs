import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
require('next/dist/server/node-environment-baseline')
const {
  captureSnapshotPreparationFailure: capture,
  assertSnapshotPreparationFailure: validate,
} = require('next/dist/experimental/testing/execution/snapshot-preparation')
const {
  serializeTaskError,
} = require('next/dist/experimental/testing/runner/tasks')
const [mode, output] = process.argv.slice(2)
const owner = {
  runId: 'owned-run',
  entryId: 'owned-entry',
  revision: 'owned-revision',
}
function makeError(throws = false) {
  const counts = { message: 0, name: 0, stack: 0 }
  const error = new Error('owned snapshot read')
  Object.defineProperties(error, {
    message: {
      configurable: true,
      get() {
        counts.message++
        if (throws) throw new Error('owned message getter')
        return 'owned snapshot read'
      },
    },
    name: {
      configurable: true,
      get() {
        counts.name++
        return 'OwnedReadError'
      },
    },
    stack: {
      configurable: true,
      get() {
        counts.stack++
        return 'OwnedReadError: owned snapshot read\n    at read (/owned/case.mjs:2:3)'
      },
    },
  })
  return { error, counts }
}
if (mode === 'undefined') {
  assert.deepEqual(capture(undefined, owner, 'run'), {
    version: 1,
    ...owner,
    phase: 'snapshot-preparation',
    invocation: 0,
    source: 'run',
    outcome: { kind: 'undefined' },
  })
} else if (mode === 'unsupported') {
  for (const value of [
    false,
    0,
    '',
    null,
    'read failure',
    { message: 'read failure' },
  ])
    assert.throws(() => capture(value, owner, 'run'), /not qualified/)
} else if (mode === 'shared') {
  const error = new Error('same actual read error')
  error.type = 'authored'
  const first = capture(error, owner, 'run'),
    second = capture(
      error,
      { ...owner, entryId: 'another-entry' },
      'failed-collection'
    )
  assert.notEqual(first, second)
  assert.notEqual(first.outcome.reportedError, second.outcome.reportedError)
  assert.equal(first.outcome.reportedError.type, 'Test Run Error')
  assert.equal(second.outcome.reportedError.message, 'same actual read error')
  assert.equal(error.type, 'authored')
} else if (mode === 'invalid') {
  const good = capture(new Error('read'), owner, 'run')
  for (const invalid of [
    { ...good, version: 2 },
    { ...good, phase: 'runtime' },
    { ...good, invocation: 1 },
    { ...good, source: 'body' },
    { ...good, runId: 'foreign' },
    { ...good, entryId: 'foreign' },
    { ...good, revision: 'foreign' },
    { ...good, extra: true },
    {
      ...good,
      outcome: { kind: 'undefined', diagnostic: good.outcome.diagnostic },
    },
    {
      ...good,
      outcome: {
        ...good.outcome,
        reportedError: { message: 'read', type: 'Unhandled Error' },
      },
    },
    {
      ...good,
      outcome: {
        ...good.outcome,
        diagnostic: { ...good.outcome.diagnostic, phase: 'collection' },
      },
    },
  ])
    assert.throws(() => validate(invalid, owner), /Invalid owned/)
  let getterCalls = 0
  const accessor = { ...good.outcome.reportedError }
  Object.defineProperty(accessor, 'stack', {
    get() {
      getterCalls++
      return 'foreign'
    },
  })
  assert.throws(
    () =>
      validate(
        { ...good, outcome: { ...good.outcome, reportedError: accessor } },
        owner
      ),
    /Invalid owned/
  )
  assert.equal(getterCalls, 0)
  const rootAccessor = { ...good }
  Object.defineProperty(rootAccessor, 'version', {
    get() {
      getterCalls++
      return 1
    },
  })
  assert.throws(() => validate(rootAccessor, owner), /Invalid owned/)
  assert.equal(getterCalls, 0)
} else {
  const make =
    mode === 'error'
      ? () => {
          const error = new Error('owned snapshot read')
          error.stack =
            'Error: owned snapshot read\n    at read (/owned/case.mjs:2:3)'
          return { error, counts: {} }
        }
      : () => makeError(mode === 'throwing-getter')
  const baseline = make(),
    actual = make()
  const expected = serializeTaskError(baseline.error)
  const descriptors = Object.getOwnPropertyDescriptors(actual.error)
  const failure = capture(actual.error, owner, 'run')
  assert.deepEqual(actual.counts, baseline.counts)
  assert.deepEqual(failure.outcome.reportedError, {
    ...expected,
    type: 'Test Run Error',
  })
  assert.equal(failure.outcome.diagnostic.message, expected.message)
  assert.equal(failure.outcome.diagnostic.stack, expected.stack)
  assert.deepEqual(Object.getOwnPropertyDescriptors(actual.error), descriptors)
  validate(failure, owner)
}
writeFileSync(
  output,
  JSON.stringify({
    mode,
    singleActualCapture: true,
    explicitUndefined: true,
    originalErrorUnchanged: true,
    execPath: process.execPath,
    version: process.version,
    versions: process.versions,
  }) + '\n'
)
