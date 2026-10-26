import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg, mode, phase] = process.argv.slice(2)
const consumer = resolve(consumerArg),
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
  assertOwnedNodeCompleted(owner, 'actual declaration occurrence ' + mode)
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const load = createRequire(join(consumer, 'package.json'))
  const { createCollector } = load(
    'next/dist/experimental/testing/runner/collector'
  )
  const failure = new Error('same actual callback cause across distinct stages')
  const before = Object.getOwnPropertyDescriptors(failure)
  let callbacks = 0
  if (mode.startsWith('collector-')) {
    const enabled = !['collector-omitted', 'collector-nontrue'].includes(mode)
    const collector = createCollector('declaration-ownership', {
      ...(mode === 'collector-nontrue'
        ? { observeSettledDeclarationCoverage: 'truthy' }
        : enabled
          ? { observeSettledDeclarationCoverage: true }
          : {}),
    })
    assert.equal(
      Object.hasOwn(collector, 'getCompletedDeclarationCoverageFailure'),
      enabled
    )
    let release
    const pending =
      mode === 'collector-pending'
        ? new Promise((resolve) => {
            release = resolve
          })
        : undefined
    const register = () =>
      collector.api.describe('actual rejected factory', async () => {
        callbacks++
        if (pending) await pending
        else await Promise.resolve()
        throw mode === 'collector-undefined' ? undefined : failure
      })
    register()
    if (mode === 'collector-multiple') register()
    if (mode === 'collector-raw')
      collector.api.describe.fn.call(
        { shuffle: false },
        'actual raw suite',
        async () => {
          throw failure
        }
      )
    let caught,
      thrown = false
    try {
      const settling = collector.settle()
      if (pending) {
        assert.equal(
          collector.getCompletedDeclarationCoverageFailure(),
          undefined
        )
        release()
      }
      await settling
    } catch (error) {
      caught = error
      thrown = true
    }
    assert(thrown)
    const observed = collector.getCompletedDeclarationCoverageFailure?.()
    if (!enabled || mode === 'collector-raw') assert.equal(observed, undefined)
    else {
      assert(observed && Object.isFrozen(observed))
      assert.equal(observed.error, caught)
      assert(Object.hasOwn(observed, 'error'))
      assert(Object.isFrozen(observed.occurrences))
      assert.equal(observed.occurrences.length, callbacks)
      assert.equal(new Set(observed.occurrences).size, callbacks)
      for (const occurrence of observed.occurrences) {
        assert(Object.isFrozen(occurrence))
        assert(collector.root.children.includes(occurrence.suite))
        assert.equal(
          occurrence.reason,
          mode === 'collector-undefined' ? undefined : failure
        )
      }
      if (mode === 'collector-multiple') {
        assert(caught instanceof globalThis.AggregateError)
        assert.deepEqual(caught.errors, [failure, failure])
        assert.notEqual(observed.occurrences[0], observed.occurrences[1])
      }
      if (mode === 'collector-repeat') {
        await assert.rejects(collector.settle(), (error) => error === failure)
        assert.equal(
          collector.getCompletedDeclarationCoverageFailure(),
          undefined
        )
      }
    }
    assert.equal(callbacks, mode === 'collector-multiple' ? 2 : 1)
    collector.close()
  } else {
    const runner = load('next/dist/experimental/testing/runner')
    const fixture = mkdtempSync(join(consumer, '.next-declaration-carriers-'))
    const filePath = join(fixture, 'suite.test.mjs')
    writeFileSync(filePath, '// actual load/declaration occurrence component\n')
    const file = runner.initializeTestFile({
      fileId: 'declaration-file-' + mode,
      filePath,
      captureCollectionCoverage: true,
      ...(mode === 'file-omitted'
        ? {}
        : { captureSettledCollectionDeclarations: true }),
      snapshotUpdateMode: 'none',
    })
    let caught,
      thrown = false,
      disposeError
    try {
      try {
        await file.collect(async () => {
          file.api.describe('actual rejected declaration', async () => {
            callbacks++
            await Promise.resolve()
            throw failure
          })
          if (mode === 'file-assertion')
            runner.getAssertionRuntime().expect.soft(1).toBe(2)
          throw failure
        })
      } catch (error) {
        caught = error
        thrown = true
      }
      assert(thrown)
      assert.equal(file.getCompletedCollectionCoverageFailure(), undefined)
      try {
        await file.dispose()
      } catch (error) {
        disposeError = error
      }
      assert.equal(disposeError, undefined)
      const observed = file.getCompletedCollectionCoverageFailure()
      if (mode === 'file-omitted' || mode === 'file-assertion') {
        assert.equal(observed, undefined)
        if (mode === 'file-assertion') {
          assert(caught instanceof globalThis.AggregateError)
          assert.equal(caught.errors.length, 3)
          assert.equal(caught.errors[0], failure)
          assert.equal(caught.errors[1], failure)
          assert.notEqual(caught.errors[2], failure)
        }
      } else {
        assert(observed && Object.isFrozen(observed))
        assert.equal(observed.error, caught)
        assert(caught instanceof globalThis.AggregateError)
        assert.equal(caught.errors.length, 2)
        if (mode !== 'file-assertion')
          assert.deepEqual(caught.errors, [failure, failure])
      }
      assert.equal(callbacks, 1)
      assert.equal(file.getOperationSettlement(), undefined)
      assert.equal(file.getNativeBodySettlement(), undefined)
      assert.equal(file.getCompletedCoverageFailures(), undefined)
    } finally {
      await file.dispose()
      rmSync(fixture, { recursive: true, force: true })
    }
  }
  assert.deepEqual(Object.getOwnPropertyDescriptors(failure), before)
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        mode,
        actualDistinctOccurrences: true,
        noInventedBodyObservation: true,
        rawErrorFieldsUnchanged: true,
        originalQueuesAndDisposalJoined: true,
      },
      null,
      2
    ) + '\n'
  )
}
