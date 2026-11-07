import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

export async function runSnapshotPreparation(selection, entryUrl) {
  const [consumerArg, outputArg, profile, phase] = process.argv.slice(2),
    consumer = resolve(consumerArg),
    output = resolve(outputArg)
  mkdirSync(output, { recursive: true })
  if (phase !== 'child') {
    const env = { ...process.env, CI: '1', NODE_ENV: 'development' }
    delete env.NODE_OPTIONS
    delete env.NODE_PATH
    const owner = await runOwnedNode(
      [fileURLToPath(entryUrl), consumer, output, profile, 'child'],
      { cwd: consumer, env, auditDir: join(output, 'owners'), timeoutMs: 30000 }
    )
    writeFileSync(
      join(output, 'owner.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    writeFileSync(join(output, 'stdout.log'), owner.stdout)
    writeFileSync(join(output, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(
      owner,
      'actual ' +
        (selection === 'skipped' ? 'skipped' : 'name-filter') +
        ' snapshot setup ' +
        profile
    )
    assert.equal(owner.status, 0, owner.stderr)
  } else {
    const [provider, mode] = profile.split(':'),
      load = createRequire(join(consumer, 'package.json')),
      { initializeTestFile } = load('next/dist/experimental/testing/runner'),
      { SnapshotClient } = load('next/dist/compiled/next-test-primitives')
    const fixture = mkdtempSync(join(consumer, '.next-skipped-snapshot-')),
      filePath = join(fixture, 'suite.test.mjs'),
      snapshotPath = join(fixture, '__snapshots__/suite.test.mjs.snap')
    writeFileSync(filePath, '// actual snapshot selection/setup/finish owner\n')
    const orphan = ![
        'selected',
        'setup-error',
        'setup-undefined',
        'read-error',
        'pending',
        'abort-pending',
        'finish-undefined',
      ].includes(mode),
      saved =
        '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\nexports[`removed owned body 1`] = `true`;\n'
    if (orphan) {
      mkdirSync(join(fixture, '__snapshots__'))
      writeFileSync(snapshotPath, saved)
    }
    const setup = Object.getOwnPropertyDescriptor(
        SnapshotClient.prototype,
        'setup'
      ),
      finish = Object.getOwnPropertyDescriptor(
        SnapshotClient.prototype,
        'finish'
      )
    const fault = new Error('actual owned snapshot setup/read failure'),
      fields = Object.getOwnPropertyDescriptors(fault),
      pending = ['pending', 'abort-pending'].includes(mode),
      deferred = () => {
        let resolve
        const promise = new Promise((r) => {
          resolve = r
        })
        return { promise, resolve }
      },
      entered = deferred(),
      release = deferred(),
      controller = new AbortController()
    let setupCalls = 0,
      finishCalls = 0,
      readCalls = 0,
      bodies = 0,
      starts = 0,
      roots = 0,
      collectedMode,
      setupAtCollected,
      runResult,
      runRejected = false,
      runError,
      disposeRejected = false
    Object.defineProperty(SnapshotClient.prototype, 'setup', {
      ...setup,
      value: function (testPath, options) {
        setupCalls++
        if (mode === 'setup-error') throw fault
        if (mode === 'setup-undefined') {
          // eslint-disable-next-line no-throw-literal -- actual undefined SDK setup rejection
          throw undefined
        }
        const env = options.snapshotEnvironment,
          observed = new Proxy(env, {
            get(target, key, receiver) {
              const value = Reflect.get(target, key, receiver)
              if (key !== 'readSnapshotFile') return value
              return function (...args) {
                readCalls++
                if (mode === 'read-error') throw fault
                return Reflect.apply(value, target, args)
              }
            },
          })
        const actual = Reflect.apply(setup.value, this, [
          testPath,
          { ...options, snapshotEnvironment: observed },
        ])
        if (!pending) return actual
        return actual.then((value) => {
          entered.resolve()
          return release.promise.then(() => value)
        })
      },
    })
    Object.defineProperty(SnapshotClient.prototype, 'finish', {
      ...finish,
      value: function (...args) {
        finishCalls++
        if (mode === 'finish-undefined') {
          // eslint-disable-next-line no-throw-literal -- actual undefined SDK finish rejection
          throw undefined
        }
        return Reflect.apply(finish.value, this, args)
      },
    })
    let file
    try {
      file = initializeTestFile({
        fileId: 'skipped-' + profile,
        filePath,
        publicTaskSelection: true,
        snapshotBodyFailures: true,
        snapshotUpdateMode: 'none',
        prepareEmptyPublicFile: true,
        ...(mode === 'omitted'
          ? {}
          : { preparePublicSnapshots: mode === 'nontrue' ? 1 : true }),
        ...(mode === 'no-mode' ? {} : { finalizePublicTaskModes: true }),
        ...(provider === 'v8' ? { finishReadOnlySnapshots: true } : {}),
      })
      assert.equal(
        typeof file.getCompletedReadOnlySnapshotCoverageFailure,
        provider === 'v8' ? 'function' : 'undefined'
      )
      const declare = (name, modifier) => {
        const body = () => {
          bodies++
        }
        if (modifier === 'only') file.api.test.only(name, body)
        else if (modifier === 'skip') file.api.test.skip(name, body)
        else file.api.test(name, body)
      }
      await file.collect(() => {
        if (!['literal-empty', 'empty-no-pass'].includes(mode)) {
          if (orphan) {
            declare(
              'first owned body',
              selection === 'focused'
                ? 'only'
                : selection === 'skipped'
                  ? 'skip'
                  : undefined
            )
            declare(
              'second owned body',
              selection === 'skipped' ? 'skip' : undefined
            )
          } else
            declare(
              'selected owned body',
              selection === 'focused' ? 'only' : undefined
            )
        }
      })
      const running = file.run({
        runId:
          selection === 'focused'
            ? 'actual-focused-snapshot'
            : 'actual-skipped-snapshot',
        ...(selection === 'focused' ? { allowOnly: true } : {}),
        ...(selection === 'skipped'
          ? {}
          : {
              testNamePattern: orphan
                ? 'no owned selected case'
                : 'selected owned body',
            }),
        signal: controller.signal,
        snapshotUpdateMode: 'none',
        passWithNoTests: mode === 'literal-empty',
        captureCompletedModuleResult: true,
        ...(provider === 'istanbul' ? { captureCoverageCompletion: true } : {}),
        onCollected(actual) {
          collectedMode = actual.mode
          setupAtCollected = setupCalls
        },
        onCaseStart() {
          starts++
        },
        onSuiteEnd(result) {
          if (result.suiteId === 'skipped-' + profile) roots++
        },
      })
      if (pending) {
        await entered.promise
        assert.equal(setupCalls, 1)
        assert.equal(bodies, 0)
        await assert.rejects(file.dispose())
        if (mode === 'abort-pending') controller.abort(fault)
        release.resolve()
      }
      try {
        runResult = await running
      } catch (error) {
        runRejected = true
        runError = error
      }
      try {
        await file.dispose(
          mode === 'cleanup-undefined'
            ? {
                beforeOwnedWorkerDispose() {
                  // eslint-disable-next-line no-throw-literal -- independent undefined cleanup failure
                  throw undefined
                },
              }
            : undefined
        )
      } catch {
        disposeRejected = true
      }
      writeFileSync(
        join(output, 'EVIDENCE.json'),
        JSON.stringify(
          {
            profile,
            setupCalls,
            finishCalls,
            readCalls,
            bodies,
            starts,
            roots,
            collectedMode,
            setupAtCollected,
            runRejected,
            disposeRejected,
            cases: runResult?.cases.map((c) => ({
              name: c.name,
              status: c.status,
            })),
            errors: runResult?.errors.map((f) => ({
              phase: f.phase,
              name: f.error?.name,
              message: f.error?.message,
            })),
            summary: file.getSnapshotSummary(),
          },
          null,
          2
        ) + '\n'
      )
      if (mode === 'empty-no-pass') {
        assert.equal(runRejected, false)
        assert.equal(disposeRejected, false)
        assert.equal(setupCalls, 1)
        assert.equal(finishCalls, 1)
        assert.equal(roots, 1)
        assert.equal(bodies, 0)
        assert.equal(starts, 0)
        assert.equal(runResult.cases.length, 0)
        assert.equal(runResult.errors.length, 1)
        assert.equal(runResult.errors[0].phase, 'runtime')
        assert.match(
          runResult.errors[0].error.message,
          /^No test suite found in file /
        )
        assert.equal(file.getCompletedCoverageFailures(), undefined)
        assert.equal(
          file.getCompletedReadOnlySnapshotCoverageFailure?.(),
          undefined
        )
      } else if (
        ['setup-error', 'setup-undefined', 'read-error'].includes(mode)
      ) {
        assert.equal(setupCalls, 1)
        assert.equal(bodies, 0)
        assert.equal(starts, 0)
        assert.equal(runRejected, true)
        assert.strictEqual(
          runError,
          mode === 'setup-undefined' ? undefined : fault
        )
        assert.equal(file.getCompletedCoverageFailures(), undefined)
        assert.equal(
          file.getCompletedReadOnlySnapshotCoverageFailure?.(),
          undefined
        )
        if (mode === 'read-error') assert.equal(readCalls, 1)
      } else if (
        [
          'omitted',
          'nontrue',
          'no-mode',
          'finish-undefined',
          'cleanup-undefined',
        ].includes(mode)
      ) {
        assert.equal(disposeRejected, true)
        assert.equal(file.getCompletedCoverageFailures(), undefined)
        assert.equal(
          file.getCompletedReadOnlySnapshotCoverageFailure?.(),
          undefined
        )
        if (mode === 'cleanup-undefined') {
          assert.equal(setupCalls, 0)
          assert.equal(finishCalls, 0)
        } else {
          assert.equal(setupCalls, 1)
          assert.equal(finishCalls, 1)
        }
      } else if (mode === 'literal-empty') {
        assert.equal(runRejected, false)
        assert.equal(disposeRejected, false)
        assert.equal(setupCalls, 1)
        assert.equal(finishCalls, 1)
        assert.equal(runResult.cases.length, 0)
        assert.equal(runResult.errors.length, 1)
        assert.match(runResult.errors[0].error.message, /Obsolete snapshots/)
      } else if (mode === 'all-skipped') {
        assert.equal(runRejected, false)
        assert.equal(disposeRejected, false)
        assert.equal(roots, 1)
        assert.equal(collectedMode, 'skip')
        assert.equal(setupAtCollected, 0)
        assert.equal(setupCalls, 0)
        assert.equal(readCalls, 0)
        assert.equal(finishCalls, 0)
        assert.equal(bodies, 0)
        assert.equal(starts, 0)
        assert.equal(runResult.cases.length, 2)
        assert(runResult.cases.every((c) => c.status === 'skipped'))
        assert.equal(runResult.errors.length, 0)
        assert.equal(file.getSnapshotSummary(), undefined)
      } else {
        assert.equal(runRejected, false)
        assert.equal(disposeRejected, false)
        assert.equal(setupCalls, 1)
        assert.equal(finishCalls, 1)
        assert.equal(setupAtCollected, 0)
        assert.equal(bodies, mode === 'abort-pending' ? 0 : 1)
        if (mode === 'abort-pending') {
          assert.equal(file.getCompletedCoverageFailures(), undefined)
          assert.equal(
            file.getCompletedReadOnlySnapshotCoverageFailure?.(),
            undefined
          )
        }
      }
      if (orphan) assert.equal(readFileSync(snapshotPath, 'utf8'), saved)
      else assert.equal(existsSync(snapshotPath), false)
      assert.deepEqual(Object.getOwnPropertyDescriptors(fault), fields)
      writeFileSync(
        join(output, 'CHECKS.json'),
        JSON.stringify(
          {
            profile,
            setupCalls,
            finishCalls,
            readCalls,
            bodies,
            starts,
            collectedMode,
            setupAtCollected,
            runRejected,
            disposeRejected,
            snapshotBytesHeld: true,
            physicalVetoesHeld: true,
          },
          null,
          2
        ) + '\n'
      )
    } finally {
      Object.defineProperty(SnapshotClient.prototype, 'setup', setup)
      Object.defineProperty(SnapshotClient.prototype, 'finish', finish)
      rmSync(fixture, { recursive: true, force: true })
    }
  }
}
