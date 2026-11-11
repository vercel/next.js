import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
require('next/dist/server/node-environment-baseline')
const runner = require('next/dist/experimental/testing/runner')
const {
  createAssertionRuntime,
} = require('next/dist/experimental/testing/assertions')
const {
  captureReporterTaskTree,
} = require('next/dist/experimental/testing/reporting/live-tasks')
const [mode, output] = process.argv.slice(2),
  directory = mkdtempSync(join(tmpdir(), 'next-snapshot-preparation-')),
  filePath = join(directory, 'owned.case.mjs'),
  snapshotPath = join(directory, '__snapshots__', 'owned.case.mjs.snap')
mkdirSync(join(directory, '__snapshots__'))
writeFileSync(filePath, '// owned private file\n')
const snapshotBytes =
  mode === 'skip-retained'
    ? '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\nexports[`obsolete 1`] = `"old"`;\n'
    : mode === 'match'
      ? '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\nexports[`body 1`] = `"owned literal"`;\n'
      : '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n'
writeFileSync(snapshotPath, snapshotBytes)
const descriptor = Object.getOwnPropertyDescriptor(fs.promises, 'readFile'),
  original = fs.promises.readFile,
  events = [],
  starts = [],
  shared = new Error('owned snapshot and disposal error')
let observedFile, privateAtRead
let readCount = 0,
  release,
  startRead
const held = new Promise((resolve) => (release = resolve)),
  started = new Promise((resolve) => (startRead = resolve))
const gated = [
  'runtime-join',
  'runtime-active',
  'runtime-undefined',
  'failed-join',
  'failed-error',
  'failed-undefined',
  'run-join',
].includes(mode)
const rejects = [
  'runtime-undefined',
  'run-error',
  'run-undefined',
  'failed-error',
  'failed-undefined',
  'dispose-same',
  'dispose-undefined',
].includes(mode)
const reason = [
  'runtime-undefined',
  'run-undefined',
  'dispose-undefined',
  'failed-undefined',
].includes(mode)
  ? undefined
  : shared
Object.defineProperty(fs.promises, 'readFile', {
  ...descriptor,
  value: async function (path, ...args) {
    if (path === snapshotPath) {
      readCount++
      events.push('read')
      if (observedFile)
        privateAtRead = {
          state: observedFile.result?.state,
          messages: observedFile.result?.errors?.map((error) => error.message),
        }
      startRead()
      if (gated) await held
      if (rejects) throw reason
    }
    return Reflect.apply(original, this, [path, ...args])
  },
})
let file, runtime, activeCollection
async function outcome(promise) {
  try {
    return { fulfilled: true, value: await promise }
  } catch (error) {
    return { fulfilled: false, error }
  }
}
try {
  if (mode === 'invalid-profile') {
    assert.throws(
      () =>
        runner.initializeTestFile({
          fileId: 'invalid',
          filePath,
          preparePublicSnapshots: true,
          collectOnly: true,
        }),
      /isolated executable file/
    )
    assert.equal(readCount, 0)
  } else if (mode.startsWith('runtime-')) {
    runtime = await createAssertionRuntime({
      testPath: filePath,
      getCurrentAttempt: () => undefined,
      getCurrentCollection: () => activeCollection,
      deferSnapshotPreparation: true,
    })
    assert.equal(readCount, 0)
    if (mode === 'runtime-active') {
      activeCollection = { id: 'owned-active-collection', name: filePath }
      const scope = runtime.beginCollection(activeCollection)
      await assert.rejects(runtime.finishFile(), /active attempt/)
      await scope.finalize()
      await scope.dispose()
      activeCollection = undefined
    }
    const first = runtime.prepareSnapshots(),
      second = runtime.prepareSnapshots()
    assert.equal(first, second)
    const observed = outcome(first)
    await started
    let finished = false
    const close1 = runtime.finishFile(),
      close2 = runtime.finishFile()
    assert.equal(close1, close2)
    void close1.then(() => (finished = true))
    await Promise.resolve()
    assert.equal(finished, false)
    release()
    const prepared = await observed
    await close1
    assert.equal(prepared.fulfilled, mode !== 'runtime-undefined')
    if (!prepared.fulfilled) assert.equal(prepared.error, undefined)
    assert.equal(readCount, 1)
    assert.throws(() => runtime.prepareSnapshots(), /after assertion disposal/)
    if (mode === 'runtime-undefined')
      assert.equal(runtime.getSnapshotSummary(), undefined)
  } else {
    const enabled = !['default', 'truthy', 'legacy-undefined'].includes(mode)
    const init = {
      fileId: 'owned:' + mode,
      filePath,
      prepareEmptyPublicFile: true,
      finalizePublicTaskModes: true,
      ...(mode === 'default' || mode === 'legacy-undefined'
        ? {}
        : { preparePublicSnapshots: mode === 'truthy' ? 'true' : true }),
      onCollectionFailure(actual, error) {
        events.push('failed-collected')
        assert.equal(error, shared)
        assert.equal(actual.result.state, 'fail')
      },
    }
    file = runner.initializeTestFile(init)
    assert.equal(Object.hasOwn(file, 'getSnapshotPreparationFailure'), enabled)
    if (['failed-join', 'failed-error', 'failed-undefined'].includes(mode)) {
      const collected = await outcome(
        file.collect(() => {
          events.push('load')
          throw shared
        })
      )
      assert.equal(collected.fulfilled, false)
      assert.equal(collected.error, shared)
      assert.equal(readCount, 0)
      assert.throws(() => file.getCollectedCases(), /finished state/)
      await assert.rejects(
        file.run({ runId: 'owned-run', signal: new AbortController().signal }),
        /finished state/
      )
      const first = file.prepareSnapshotsAfterFailedCollection(),
        second = file.prepareSnapshotsAfterFailedCollection()
      assert.equal(first, second)
      const prepared = outcome(first)
      await started
      let disposed = false
      const close1 = file.dispose(),
        close2 = file.dispose()
      assert.equal(close1, close2)
      void close1.then(() => (disposed = true))
      await Promise.resolve()
      assert.equal(disposed, false)
      release()
      const preparedResult = await prepared
      assert.equal(preparedResult.fulfilled, mode === 'failed-join')
      if (mode === 'failed-join')
        assert.equal(file.getSnapshotPreparationFailure(), undefined)
      else {
        assert.equal(preparedResult.error, reason)
        const failure = file.getSnapshotPreparationFailure()
        assert(failure)
        assert.equal(Object.hasOwn(failure, 'error'), true)
        assert.equal(failure.error, reason)
        assert.equal(failure.source, 'failed-collection')
        assert.equal(failure.propagatedThroughRun, false)
      }
      await close1
    } else {
      await file.collect(() => {
        events.push('load')
        if (mode === 'empty') return
        file.api.beforeAll(() => events.push('before-all'))
        file.api.afterAll(() => events.push('after-all'))
        const body = () => {
          events.push('body')
          if (mode === 'match') runner.expect('owned literal').toMatchSnapshot()
        }
        if (mode === 'skip' || mode === 'skip-retained')
          file.api.test.skip('body', body)
        else file.api.test('body', body)
      })
      assert.equal(readCount, enabled ? 0 : 1)
      let collectedTree, privateFile
      const run = file.run({
        runId: 'owned-run',
        signal: new AbortController().signal,
        onCollected(actual) {
          events.push('collected')
          privateFile = actual
          observedFile = actual
          collectedTree = captureReporterTaskTree(actual)
          if (mode === 'observer-error') throw shared
          if (mode === 'observer-undefined' || mode === 'legacy-undefined') {
            // eslint-disable-next-line no-throw-literal -- This verifies the real undefined rejection boundary.
            throw undefined
          }
        },
        onCaseStart(context) {
          starts.push(context.testId)
        },
      })
      const running = outcome(run)
      if (mode === 'run-join') {
        await started
        assert.equal(file.getSnapshotPreparationFailure(), undefined)
        assert.equal(events.includes('body'), false)
        assert.throws(() => file.getCollectedCases(), /running state/)
        await assert.rejects(file.dispose(), /Abort and await/)
        release()
      }
      const observed = await running
      if (
        ['observer-error', 'observer-undefined', 'legacy-undefined'].includes(
          mode
        )
      ) {
        assert.equal(observed.fulfilled, false)
        assert.equal(
          observed.error,
          mode === 'observer-error' ? shared : undefined
        )
        assert.equal(readCount, enabled ? 0 : 1)
        if (enabled)
          assert.equal(file.getSnapshotPreparationFailure(), undefined)
      } else if (rejects) {
        assert.equal(observed.fulfilled, false)
        assert.equal(observed.error, reason)
        const failure = file.getSnapshotPreparationFailure()
        assert(failure)
        assert.equal(failure.error, reason)
        assert.equal(Object.hasOwn(failure, 'error'), true)
        assert.equal(failure.propagatedThroughRun, true)
        assert.equal(failure.invocation, 0)
        assert.equal(starts.length, 0)
        assert.equal(events.includes('body'), false)
      } else {
        assert.equal(observed.fulfilled, true)
        if (enabled)
          assert.equal(file.getSnapshotPreparationFailure(), undefined)
        if (mode === 'skip' || mode === 'skip-retained') {
          assert.equal(readCount, 0)
          assert.equal(starts.length, 0)
          assert.equal(events.includes('body'), false)
        } else if (mode === 'empty') {
          assert.equal(readCount, 1)
          assert.equal(collectedTree.result, undefined)
          assert.equal(privateFile.result.state, 'fail')
          assert.deepEqual(privateAtRead, {
            state: 'fail',
            messages: ['No test suite found in file ' + filePath],
          })
          assert.equal(
            observed.value.errors[0].error.message,
            'No test suite found in file ' + filePath
          )
          assert.equal(starts.length, 0)
        } else {
          assert.equal(readCount, 1)
          assert.equal(starts.length, 1)
          assert.equal(events.includes('body'), true)
        }
      }
      if (
        mode === 'dispose-same' ||
        mode === 'dispose-undefined' ||
        mode === 'success-dispose-error'
      ) {
        const disposed = await outcome(
          file.dispose({
            beforeOwnedWorkerDispose() {
              throw reason
            },
          })
        )
        assert.equal(disposed.fulfilled, false)
        assert.equal(disposed.error, reason)
        if (mode === 'success-dispose-error')
          assert.equal(file.getSnapshotPreparationFailure(), undefined)
        else assert.equal(file.getSnapshotPreparationFailure().error, reason)
        assert.equal(file.hasCompletedBodyExecution(), false)
        assert.equal(file.canPublishSnapshots(), false)
      } else await file.dispose()
    }
  }
  assert.equal(fs.readFileSync(snapshotPath, 'utf8'), snapshotBytes)
  writeFileSync(
    output,
    JSON.stringify({
      mode,
      readCount,
      events,
      starts,
      exactSnapshotBytesHeld: true,
      actualPhaseAndDisposalJoined: true,
    }) + '\n'
  )
} finally {
  Object.defineProperty(fs.promises, 'readFile', descriptor)
  try {
    await file?.dispose()
  } catch {}
  try {
    await runtime?.finishFile()
  } catch {}
  rmSync(directory, { recursive: true, force: true })
}
