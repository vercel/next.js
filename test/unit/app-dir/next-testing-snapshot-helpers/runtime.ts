import assert from 'node:assert/strict'
import { it } from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createAssertionRuntime,
  type AssertionAttempt,
  type MatcherState,
} from 'next/dist/experimental/testing/assertions'
import { createSnapshotHelpers } from 'next/dist/experimental/testing/assertions/snapshot-helpers'

async function withRuntime(
  updateSnapshots: boolean,
  body: (file: {
    runtime: Awaited<ReturnType<typeof createAssertionRuntime>>
    begin(
      id: string
    ): ReturnType<
      Awaited<ReturnType<typeof createAssertionRuntime>>['beginAttempt']
    >
    directory: string
  }) => Promise<void>
) {
  const directory = await mkdtemp(join(tmpdir(), 'next-snapshot-helpers-'))
  const testPath = join(directory, 'example.case.ts')
  await writeFile(testPath, 'export {}\n')
  await writeFile(join(directory, 'value.txt'), 'abc')
  let active: AssertionAttempt | undefined
  const runtime = await createAssertionRuntime({
    testPath,
    getCurrentAttempt: () => active,
    updateSnapshots,
  })
  let scope: ReturnType<typeof runtime.beginAttempt> | undefined
  try {
    await body({
      runtime,
      directory,
      begin(id) {
        active = { id, testId: id, name: 'case' }
        scope = runtime.beginAttempt(active)
        return scope
      },
    })
  } finally {
    await scope?.dispose()
    active = undefined
    await runtime.finishFile()
    await rm(directory, { recursive: true, force: true })
  }
}

it('composes all five helpers with original counts and staged snapshot bytes', () =>
  withRuntime(true, async ({ runtime, begin, directory }) => {
    const helpers = createSnapshotHelpers(runtime.callSnapshotHelper)
    const adapter = {
      name: 'number',
      capture: Number,
      render: String,
      parseExpected: Number,
      match: (received: number, expected: number) => ({
        pass: received === expected,
      }),
    }
    runtime.expect.extend({
      toManaged(received, ...args) {
        return helpers.toMatchSnapshot.call(this, received, ...args)
      },
      toInline(received, inline) {
        return helpers.toMatchInlineSnapshot.call(this, received, inline)
      },
      toRaw(received, path) {
        return helpers.toMatchFileSnapshot.call(this, received, path)
      },
      toDomain(received) {
        return helpers.toMatchDomainSnapshot.call(this, adapter, received)
      },
      toDomainInline(received, inline) {
        return helpers.toMatchDomainInlineSnapshot.call(
          this,
          adapter,
          received,
          inline
        )
      },
    })
    const scope = begin('helpers')
    const check = runtime.expect as any
    check.assertions(5)
    check({ value: 7 }).toManaged({ value: check.any(Number) }, 'value')
    check(7).toInline('7')
    await check('abc').toRaw('./value.txt')
    check(7).toDomain()
    check(7).toDomainInline('7')
    assert.equal(check.getState().assertionCalls, 5)
    await scope.finalize()
    await scope.dispose()
    await runtime.finishFile()
    const summary = runtime.getSnapshotSummary()!
    assert.equal(summary.added, 2)
    assert.equal(summary.matched, 3)
    assert.equal(summary.unmatched, 0)
    const updates = runtime.takeSnapshotUpdates()
    assert.equal(updates.length, 1)
    assert.match(JSON.stringify(updates), /Number/)
    assert.equal(await readFile(join(directory, 'value.txt'), 'utf8'), 'abc')
  }))

it('keeps soft asynchronous raw mismatch and assertion counting in the original task', () =>
  withRuntime(false, async ({ runtime, begin }) => {
    const helpers = createSnapshotHelpers(runtime.callSnapshotHelper)
    runtime.expect.extend({
      toRaw(received, path) {
        return helpers.toMatchFileSnapshot.call(this, received, path)
      },
    })
    const scope = begin('soft')
    const check = runtime.expect as any
    check.assertions(1)
    await check.soft('xyz').toRaw('./value.txt')
    assert.equal(check.getState().assertionCalls, 1)
    await assert.rejects(scope.finalize(), (error: AggregateError) => {
      assert.equal(error.errors.length, 1)
      assert.match(error.errors[0].message, /mismatched/)
      return true
    })
  }))

it('refuses a captured matcher state after its attempt closes and after file disposal', () =>
  withRuntime(false, async ({ runtime, begin }) => {
    const helpers = createSnapshotHelpers(runtime.callSnapshotHelper)
    let captured!: MatcherState
    runtime.expect.extend({
      toCapture() {
        captured = this
        return { pass: true, message: () => '' }
      },
    })
    const first = begin('first')
    ;(runtime.expect as any)(1).toCapture()
    await first.finalize()
    await first.dispose()
    const second = begin('second')
    assert.throws(
      () => helpers.toMatchSnapshot.call(captured, 1),
      /different Next assertion scope/
    )
    runtime.expect(2).toBe(2)
    assert.equal(runtime.expect.getState().assertionCalls, 1)
    await second.finalize()
    await second.dispose()
    await runtime.finishFile()
    assert.throws(
      () => helpers.toMatchSnapshot.call(captured, 1),
      /different Next assertion scope|active Next test/
    )
    assert.deepEqual(runtime.takeSnapshotUpdates(), [])
  }))

it('retains the custom matcher name in negated helper refusals and actual unbound errors', () =>
  withRuntime(false, async ({ runtime, begin }) => {
    const helpers = createSnapshotHelpers(runtime.callSnapshotHelper)
    runtime.expect.extend({
      toCompact(received) {
        return helpers.toMatchSnapshot.call(this, received)
      },
    })
    const scope = begin('refusals')
    assert.throws(
      () => (runtime.expect as any)('abc').not.toCompact(),
      /toCompact cannot be used with "not"/
    )
    const unbound = helpers.toMatchSnapshot
    assert.throws(
      () => Reflect.apply(unbound, undefined, [1]),
      /Cannot read properties of undefined \(reading 'assertion'\)/
    )
    await scope.finalize()
  }))

it('keeps the empty property-inline expected value absent', () =>
  withRuntime(false, async ({ runtime, begin }) => {
    const helpers = createSnapshotHelpers(runtime.callSnapshotHelper)
    runtime.expect.extend({
      toObjectInline(received, properties, inline) {
        return helpers.toMatchInlineSnapshot.call(
          this,
          received,
          properties,
          inline
        )
      },
    })
    const scope = begin('empty property inline')
    assert.throws(
      () =>
        (runtime.expect as any)({ score: 7 }).toObjectInline(
          { score: runtime.expect.any(Number) },
          ''
        ),
      (error) => {
        assert.ok(error instanceof Error)
        const values = error as Error & { actual?: unknown; expected?: unknown }
        assert.equal(values.message, 'Snapshot `case 1` mismatched')
        assert.equal(values.expected, undefined)
        assert.match(String(values.actual), /Any<Number>/)
        return true
      }
    )
    await scope.finalize()
  }))
