// A real process rejection is required; node:test/Jest own their own rejection listeners.
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const runner = require(process.argv[2])
const { test, expect } = require(process.argv[3])
const reason =
  process.argv[4] === 'primitive'
    ? 'first owner rejection'
    : new Error('first owner rejection')
const directory = mkdtempSync(join(tmpdir(), 'next-real-rejection-origin-'))
let release
const gate = new Promise((resolve) => {
  release = resolve
})
const failures = []
const reported = []
let nextBodyActive = false
const worker = runner.initializeTestWorker({
  workerId: 'rejection',
  onFailure: (failure) => failures.push(failure),
})
const handler = (error) =>
  assert.equal(runner.routeUnhandledRejection(error), true)
process.on('unhandledRejection', handler)
;(async () => {
  const files = []
  for (const name of ['first', 'second']) {
    const file = worker.createFile({
      fileId: name,
      filePath: join(directory, name + '.test.ts'),
      updateSnapshots: true,
      onUnhandledRejection: (error) =>
        reported.push({ fileId: name, error, nextBodyActive }),
    })
    files.push(file)
    try {
      await file.collect(async () => {
        test(name, async () => {
          if (name === 'first') void gate.then(() => Promise.reject(reason))
          else {
            nextBodyActive = true
            release()
            await new Promise((resolve) => setImmediate(resolve))
            await new Promise((resolve) => setImmediate(resolve))
            nextBodyActive = false
          }
          expect(42).toMatchSnapshot()
        })
      })
      const result = await file.run({
        runId: 'rejection',
        signal: new AbortController().signal,
      })
      assert.deepEqual(
        result.cases.map((test) => test.status),
        ['passed']
      )
    } finally {
      await file.dispose()
    }
  }
  assert.equal(reported.length, 1)
  assert.equal(reported[0].fileId, 'first')
  assert.equal(reported[0].error, reason)
  assert.equal(reported[0].nextBodyActive, true)
  assert.equal(failures[0].fileId, 'first')
  await assert.rejects(worker.dispose(), (error) => {
    assert.equal(error, reason)
    return true
  })
  for (const file of files)
    assert.throws(
      () => file.takeSnapshotUpdates(),
      /successful execution and disposal/
    )
  console.log(
    JSON.stringify({
      origin: reported[0].fileId,
      nextBodyActive: reported[0].nextBodyActive,
      rawIdentity: reported[0].error === reason,
      snapshotsVetoed: true,
    })
  )
})()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await worker.dispose().catch(() => {})
    process.removeListener('unhandledRejection', handler)
    rmSync(directory, { recursive: true, force: true })
  })
