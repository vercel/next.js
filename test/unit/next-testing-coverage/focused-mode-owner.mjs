import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, mode, phase] = process.argv.slice(2),
  consumer = resolve(consumerArg),
  output = resolve(outputArg)
mkdirSync(output, { recursive: true })
if (phase !== 'child') {
  const env = { ...process.env, CI: '1', NODE_ENV: 'development' }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  const owner = await runOwnedNode(
    [fileURLToPath(import.meta.url), consumer, output, mode, 'child'],
    { cwd: consumer, env, auditDir: join(output, 'owners'), timeoutMs: 30000 }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'actual focused mode owner ' + mode)
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const load = createRequire(join(consumer, 'package.json'))
  let bodies = 0,
    starts = 0,
    attempts = 0,
    prepares = 0,
    actualFile,
    result
  const signal = new AbortController().signal
  if (mode.startsWith('file-')) {
    const { initializeTestFile } = load(
        'next/dist/experimental/testing/runner'
      ),
      { SnapshotClient } = load('next/dist/compiled/next-test-primitives'),
      setup = Object.getOwnPropertyDescriptor(
        SnapshotClient.prototype,
        'setup'
      ),
      fixture = mkdtempSync(join(consumer, '.next-focused-owner-'))
    let file
    try {
      writeFileSync(
        join(fixture, 'suite.test.mjs'),
        '// actual private File selection ownership\n'
      )
      Object.defineProperty(SnapshotClient.prototype, 'setup', {
        ...setup,
        value: function (...args) {
          prepares++
          return Reflect.apply(setup.value, this, args)
        },
      })
      file = initializeTestFile({
        fileId: 'focused-owner',
        filePath: join(fixture, 'suite.test.mjs'),
        snapshotUpdateMode: mode === 'file-not-readonly' ? 'new' : 'none',
        ...(mode === 'file-no-public' ? {} : { publicTaskSelection: true }),
        ...(mode === 'file-no-prepare' ? {} : { preparePublicSnapshots: true }),
        ...(mode === 'file-no-finalize'
          ? {}
          : { finalizePublicTaskModes: true }),
      })
      await file.collect(() => {
        file.api.test.only('first', () => bodies++)
        file.api.test('second', () => bodies++)
      })
      result = await file.run({
        runId: 'focused-owner',
        signal,
        allowOnly: true,
        testNamePattern: 'never-selected',
        finalizeFocusedPublicTaskModes: true,
        ...(mode === 'file-inactive-injected'
          ? {}
          : { captureCoverageCompletion: true }),
        onCollected(actual) {
          actualFile = actual
        },
        onCaseStart() {
          starts++
        },
        beginAttempt() {
          attempts++
          return {}
        },
      })
      await file.dispose()
      assert.equal(actualFile.mode, 'run')
      assert.equal(result.errors.length, 0)
      assert.equal(result.cases.length, 2)
      assert(result.cases.every((c) => c.status === 'skipped'))
    } finally {
      if (file) await file.dispose()
      Object.defineProperty(SnapshotClient.prototype, 'setup', setup)
      rmSync(fixture, { recursive: true, force: true })
    }
  } else {
    const { createCollector } = load(
        'next/dist/experimental/testing/runner/collector'
      ),
      { runCollected } = load(
        'next/dist/experimental/testing/runner/lifecycle'
      ),
      c = createCollector('focused-owner')
    let hooks = 0,
      allowReads = 0
    if (mode === 'empty') c.api.describe.only('empty', () => {})
    else if (mode === 'under-skip') {
      c.api.describe.skip('outer', () =>
        c.api.test.only('first', () => bodies++)
      )
      c.api.test('second', () => bodies++)
    } else if (mode === 'suite-under-todo') {
      c.api.describe.todo('outer', () =>
        c.api.describe.only('inner', () => {
          c.api.beforeAll(() => hooks++)
          c.api.test('first', () => bodies++)
        })
      )
      c.api.test('second', () => bodies++)
    } else {
      c.api.test.only('first', () => bodies++)
      c.api.test('second', () => bodies++)
    }
    const root = c.close(),
      options = {
        runId: 'focused-owner',
        signal,
        testNamePattern: 'never-selected',
        passWithNoTests: mode === 'empty',
        finalizePublicTaskModes: true,
        ...(mode === 'omitted'
          ? {}
          : {
              finalizeFocusedPublicTaskModes:
                mode === 'false' ? false : mode === 'one' ? 1 : true,
            }),
        get allowOnly() {
          allowReads++
          return mode === 'forbidden' ? false : true
        },
        onCollected(actual) {
          actualFile = actual
        },
        prepareSnapshots(actual) {
          if (actual.mode !== 'skip') prepares++
        },
        onCaseStart() {
          starts++
        },
        beginAttempt() {
          attempts++
          return {}
        },
      }
    result = await runCollected(root, options, () => {})
    assert.equal(allowReads, 2)
    assert.equal(hooks, 0)
    if (['allowed', 'under-skip', 'suite-under-todo'].includes(mode)) {
      assert.equal(actualFile.mode, 'skip')
      assert.equal(prepares, 0)
      if (mode === 'under-skip') {
        const test = actualFile.tasks[0].tasks[0]
        assert.equal(test.mode, 'only')
        assert.equal(Object.hasOwn(test, 'result'), false)
      }
      if (mode === 'suite-under-todo') {
        const suite = actualFile.tasks[0].tasks[0],
          test = suite.tasks[0]
        assert.equal(suite.mode, 'only')
        assert.equal(Object.hasOwn(suite, 'result'), false)
        assert.equal(test.mode, 'run')
        assert.equal(Object.hasOwn(test, 'result'), false)
      }
    } else {
      assert.equal(actualFile.mode, 'run')
      assert.equal(prepares, 1)
    }
    if (mode === 'forbidden') {
      // The unchanged baseline filters every case before its existing only error.
      assert(result.cases.every((item) => item.status === 'skipped'))
      assert.equal(result.errors.length, 0)
    } else if (mode === 'empty') {
      assert.equal(result.errors.length, 1)
      assert.equal(result.errors[0].phase, 'runtime')
      assert.equal(
        result.errors[0].error.message,
        'No test found in suite empty'
      )
    } else assert.equal(result.errors.length, 0)
  }
  assert.equal(bodies, 0)
  assert.equal(starts, 0)
  assert.equal(attempts, 0)
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        mode,
        collectedMode: actualFile.mode,
        bodies,
        starts,
        attempts,
        prepares,
        cases: result.cases.map((c) => ({
          status: c.status,
          attemptId: c.attemptId,
        })),
        operationalBodiesAndAttemptsUnchanged: true,
        unstartedOnlyHasNoManufacturedResult: true,
        privateOwnerBoundaryHeld: true,
      },
      null,
      2
    ) + '\n'
  )
}
