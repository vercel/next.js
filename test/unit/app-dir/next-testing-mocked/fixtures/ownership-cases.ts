import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import {
  createAssertionRuntime,
  type AssertionAttempt,
  type AssertionCollection,
} from 'next/dist/experimental/testing/assertions'

async function main() {
  // Plain adapter realm only: no native/compiler/Next file host/browser is opened.
  const facadePath = process.argv[2]
  assert(
    facadePath,
    'The reviewed facade source or matching built file is required'
  )
  const requireFacade = createRequire(process.argv[1])
  const { vi, vitest } = requireFacade(
    facadePath
  ) as typeof import('next/dist/experimental/testing/vitest')
  const item = { value: 1 }
  const moduleIdentity = Object.is(vi.mocked(item), item)
  assert.equal(moduleIdentity, true)
  assert.equal(vi.mocked, vitest.mocked)

  const directory = await mkdtemp(join(tmpdir(), 'next-mocked-unit-'))
  let runtime: Awaited<ReturnType<typeof createAssertionRuntime>> | undefined
  let scope: ReturnType<NonNullable<typeof runtime>['beginAttempt']> | undefined
  let collectionScope:
    | ReturnType<NonNullable<typeof runtime>['beginCollection']>
    | undefined
  let primaryFailed = false
  let primaryFailure: unknown
  const cleanupFailures: unknown[] = []
  let active: AssertionAttempt | undefined
  let collection: AssertionCollection | undefined
  const result: Record<string, boolean> = { module: moduleIdentity }
  try {
    runtime = await createAssertionRuntime({
      testPath: join(directory, 'mocked.test.ts'),
      getCurrentAttempt: () => active,
      getCurrentCollection: () => collection,
    })
    collection = { id: 'collection', name: 'mocked collection' }
    collectionScope = runtime.beginCollection(collection)
    result.collection = Object.is(vi.mocked(item), item)
    await collectionScope.dispose()
    collectionScope = undefined
    collection = undefined

    active = { id: 'attempt', testId: 'case', name: 'mocked state' }
    scope = runtime.beginAttempt(active)
    const mock = runtime.spies.fn((value: number) => value * 2)
    assert.equal(mock(3), 6)
    const beforeCalls = mock.mock.calls.map((args) => [...args])
    const beforeAssertionCount = runtime.expect.getState().assertionCalls
    const retained = vi.mocked(mock, { partial: true, deep: true })
    result.active = Object.is(retained, mock)
    result.history =
      JSON.stringify(mock.mock.calls) === JSON.stringify(beforeCalls)
    result.assertionCount =
      runtime.expect.getState().assertionCalls === beforeAssertionCount
    result.chain = retained.mockReturnValue(8) === mock && mock(4) === 8
    await scope.dispose()
    scope = undefined
    active = undefined
    await runtime.finishFile()
    runtime = undefined

    // The helper is pure after closure; the real pre-existing mutator guards are
    // retained. A raw mock invocation is not claimed to have a new scope policy.
    result.closed = Object.is(vi.mocked(mock), mock)
    let returnValueRefused = false
    let clearRefused = false
    try {
      retained.mockReturnValue(9)
    } catch (error) {
      returnValueRefused =
        error instanceof Error && /disposed assertion scope/.test(error.message)
    }
    try {
      retained.mockClear()
    } catch (error) {
      clearRefused =
        error instanceof Error && /disposed assertion scope/.test(error.message)
    }
    result.mockReturnValueRefused = returnValueRefused
    result.mockClearRefused = clearRefused
  } catch (error) {
    primaryFailed = true
    primaryFailure = error
  } finally {
    // Independent attempts retain both the primary failure and every cleanup
    // failure. The original collection is never hidden from finishFile.
    try {
      await scope?.dispose()
    } catch (error) {
      cleanupFailures.push(error)
    }
    try {
      await collectionScope?.dispose()
    } catch (error) {
      cleanupFailures.push(error)
    }
    active = undefined
    collection = undefined
    try {
      await runtime?.finishFile()
    } catch (error) {
      cleanupFailures.push(error)
    }
    try {
      await rm(directory, { recursive: true, force: true })
    } catch (error) {
      cleanupFailures.push(error)
    }
  }
  if (primaryFailed || cleanupFailures.length) {
    throw new AggregateError(
      [...(primaryFailed ? [primaryFailure] : []), ...cleanupFailures],
      'Mocked adapter primary/cleanup failure'
    )
  }
  await assert.rejects(stat(directory), { code: 'ENOENT' })
  result.resourcesClosed = true
  for (const value of Object.values(result)) assert.equal(value, true)
  process.stdout.write(JSON.stringify(result))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
