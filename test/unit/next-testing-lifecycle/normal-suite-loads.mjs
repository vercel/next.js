import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
const [consumerArg, group] = process.argv.slice(2)
const consumer = path.resolve(consumerArg)
const load = createRequire(path.join(consumer, 'package.json'))
const runner = load('next/dist/experimental/testing/runner')
const failures = {
  undefined,
  null: null,
  false: false,
  zero: 0,
  empty: '',
  error: new Error('actual original load Error'),
  owned: new Error('actual owned-work load Error'),
}
assert(Object.hasOwn(failures, group))
const failure = failures[group]
const descriptors =
  failure instanceof Error
    ? Object.getOwnPropertyDescriptors(failure)
    : undefined
const fixture = fs.mkdtempSync(path.join(consumer, '.next-normal-suite-load-'))
const filePath = path.join(fixture, 'suite.test.mjs')
fs.writeFileSync(filePath, '// actual file collection callback below\n')
const file = runner.initializeTestFile({
  fileId: 'normal-load-' + group,
  filePath,
  captureCollectionCoverage: true,
  captureSettledCollectionDeclarations: true,
  snapshotUpdateMode: 'none',
})
const trace = []
const ownedFailure = new Error('actual handled collector error')
let release
let pending
let handled
let collection
let enter
const entered = new Promise((resolve) => {
  enter = resolve
})
let observed = false
let caught
const gate = new Promise((resolve) => {
  release = resolve
})
try {
  collection = file
    .collect(async () => {
      const owned = file.api.describe('actual declaration', async () => {
        trace.push('owned entered')
        enter()
        await gate
        trace.push('owned resumed')
        throw ownedFailure
      })
      file.api.describe('never started', () => {
        trace.push('unstarted')
      })
      if (group === 'owned') {
        pending = owned.collect(owned.file)
        handled = pending.then(
          () => {
            throw new Error('manual collector must reject')
          },
          (error) => {
            assert.equal(error, ownedFailure)
            trace.push('handled')
          }
        )
      }
      throw failure
    })
    .then(
      () => {
        throw new Error('actual failed load must reject')
      },
      (error) => {
        caught = error
        observed = true
      }
    )
  if (group === 'owned') {
    await entered
    assert.equal(observed, false)
    assert.deepEqual(trace, ['owned entered'])
    assert.equal(file.getCompletedCollectionCoverageFailure(), undefined)
    release()
  }
  await collection
  if (handled) await handled
  assert.equal(observed, true)
  assert.equal(caught, failure)
  assert.deepEqual(
    trace,
    group === 'owned' ? ['owned entered', 'owned resumed', 'handled'] : []
  )
  assert.equal(file.getCompletedCollectionCoverageFailure(), undefined)
  await file.dispose()
  const completed = file.getCompletedCollectionCoverageFailure()
  assert(completed && Object.isFrozen(completed))
  assert.equal(completed.error, failure)
  assert.equal(file.getOperationSettlement(), undefined)
  assert.equal(file.getNativeBodySettlement(), undefined)
  assert.equal(file.getCompletedCoverageFailures(), undefined)
  if (descriptors)
    assert.deepEqual(Object.getOwnPropertyDescriptors(failure), descriptors)
  console.log(
    JSON.stringify({
      group,
      actualLoadValueRetained: true,
      noUnstartedFactoryRan: true,
      ownedWorkJoined: true,
      noInventedDeclarationOrBodyOccurrence: true,
    })
  )
} finally {
  release()
  if (collection) await collection
  if (handled) await handled
  await file.dispose()
  fs.rmSync(fixture, { recursive: true, force: true })
}
