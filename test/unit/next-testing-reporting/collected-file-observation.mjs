import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const { AggregateError } = globalThis
const require = createRequire(import.meta.url)
require('next/dist/server/node-environment-baseline')
const { initializeTestFile } = require('next/dist/experimental/testing/runner')
const [mode, output] = process.argv.slice(2)
const first = new Error('owned first collection failure')
const second = new Error('owned second collection failure')
const original =
  mode === 'undefined-load'
    ? undefined
    : mode === 'aggregate-load'
      ? new AggregateError([first, second], 'owned aggregate')
      : mode === 'nested-load'
        ? new AggregateError(
            [new AggregateError([first], 'owned nested'), second],
            'owned outer'
          )
        : first
const observationError =
  mode === 'undefined-observer'
    ? undefined
    : mode === 'same-observer'
      ? original
      : new Error('owned observation failure')
let release, reached
const gate = new Promise((resolve) => {
  release = resolve
})
const started = new Promise((resolve) => {
  reached = resolve
})
let observed,
  bodies = 0
const file = initializeTestFile({
  fileId: 'owned:observer',
  filePath: '/owned/observer.case.mjs',
  snapshotUpdateMode: 'none',
  onCollectionFailure: async (actualFile, error) => {
    observed = { actualFile, error }
    reached()
    await gate
    if (
      ['error-observer', 'undefined-observer', 'same-observer'].includes(mode)
    )
      throw observationError
  },
})
let failed = false,
  failure
const collecting = file
  .collect(async () => {
    file.api.test('declared but unstarted', () => {
      bodies++
    })
    throw original
  })
  .catch((error) => {
    failed = true
    failure = error
  })
await started
assert.equal(observed.error, original)
assert.equal(observed.actualFile.file, observed.actualFile)
assert.equal(observed.actualFile.id, 'owned:observer')
assert.equal(observed.actualFile.result.state, 'fail')
assert.equal(observed.actualFile.tasks.length, 0)
const messages = observed.actualFile.result.errors.map((error) => error.message)
assert.deepEqual(
  messages,
  mode === 'undefined-load'
    ? ['undefined']
    : mode === 'aggregate-load'
      ? ['owned first collection failure', 'owned second collection failure']
      : mode === 'nested-load'
        ? ['owned nested', 'owned second collection failure']
        : ['owned first collection failure']
)
assert.equal(file.getCompletedCollectionCoverageFailure(), undefined)
assert.throws(() => file.getCollectedCases(), /collecting state/)
await assert.rejects(file.dispose(), /active test file/)
await assert.rejects(
  file.run({ runId: 'owned', signal: new AbortController().signal }),
  /collecting state/
)
assert.equal(failed, false)
release()
await collecting
assert.equal(failed, true)
if (['error-observer', 'undefined-observer', 'same-observer'].includes(mode)) {
  assert(failure instanceof AggregateError)
  assert.equal(failure.errors.length, 2)
  assert.equal(failure.errors[0], original)
  assert.equal(failure.errors[1], observationError)
} else assert.equal(failure, original)
assert.throws(() => file.getCollectedCases(), /finished state/)
assert.equal(bodies, 0)
await file.dispose()
assert.equal(file.getCompletedCollectionCoverageFailure(), undefined)
writeFileSync(
  output,
  JSON.stringify(
    {
      mode,
      originalIdentityHeld: true,
      actualUnfinalizedFile: true,
      observerOwnedUntilJoined: true,
      runListDisposeFencesHeld: true,
      bodyInvocations: bodies,
      completionNotCertifiedByObservation: true,
      messages,
    },
    null,
    2
  ) + '\n'
)
