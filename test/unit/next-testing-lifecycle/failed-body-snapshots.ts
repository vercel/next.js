import assert from 'node:assert/strict'
import { it } from 'node:test'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { initializeTestFile } from 'next/dist/experimental/testing/runner'
import { test, afterEach } from 'next/dist/experimental/testing/vitest'

const options = () => ({
  runId: 'failed-body-snapshots',
  signal: new AbortController().signal,
})

it('stages snapshots after completed thrown and hard assertion body failures, only after disposal', async () => {
  for (const kind of ['throw', 'assertion'] as const) {
    const directory = await mkdtemp(
      join(tmpdir(), 'next-failed-body-snapshot-')
    )
    const file = initializeTestFile({
      fileId: 'failed-body-' + kind,
      filePath: join(directory, 'file.test.ts'),
      updateSnapshots: true,
      snapshotBodyFailures: true,
    })
    try {
      assert.equal(file.canPublishSnapshots(), false)
      await file.collect(async () => {
        test('failed body', ({ expect: local }) => {
          local('recorded value').toMatchSnapshot('value')
          if (kind === 'throw') throw new Error('ordinary body failure')
          local(1).toBe(2)
        })
        test('following body', ({ expect: local }) => {
          local('following value').toMatchSnapshot('value')
        })
      })
      assert.equal(file.canPublishSnapshots(), false)
      const result = await file.run(options())
      assert.deepEqual(
        result.cases.map(({ status }) => status),
        ['failed', 'passed']
      )
      assert.deepEqual(result.errors, [])
      assert.equal(result.interrupted, false)
      assert.deepEqual(
        result.cases[0].errors.map(({ phase }) => phase),
        ['test']
      )
      assert.equal(file.canPublishSnapshots(), false)
      assert.throws(
        () => file.takeSnapshotUpdates(),
        /successful execution and disposal/
      )
      await file.dispose()
      assert.equal(file.canPublishSnapshots(), true)
      const updates = file.takeSnapshotUpdates()
      assert.equal(updates.length, 1)
      assert.match(updates[0].content!, /recorded value/)
      assert.match(updates[0].content!, /following value/)
      await assert.rejects(access(join(directory, '__snapshots__')))
    } finally {
      await file.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  }
})

it('keeps non-body failures and cancellation from publishing a failed body snapshot', async () => {
  for (const kind of ['afterEach', 'cancel'] as const) {
    const directory = await mkdtemp(join(tmpdir(), 'next-failed-body-veto-'))
    const controller = new AbortController()
    const file = initializeTestFile({
      fileId: 'failed-body-veto-' + kind,
      filePath: join(directory, 'file.test.ts'),
      updateSnapshots: true,
      snapshotBodyFailures: true,
    })
    try {
      await file.collect(async () => {
        if (kind === 'afterEach')
          afterEach(() => {
            throw new Error('owned cleanup failure')
          })
        test('failed body', ({ expect: local }) => {
          local('recorded value').toMatchSnapshot('value')
          throw new Error('ordinary body failure')
        })
      })
      const result = await file.run({
        ...options(),
        signal: controller.signal,
        onCaseEnd() {
          if (kind === 'cancel')
            controller.abort(new Error('cancel at completed body'))
        },
      })
      assert.equal(result.cases[0].status, 'failed')
      assert.equal(result.interrupted, kind === 'cancel')
      await file.dispose()
      assert.equal(file.canPublishSnapshots(), false)
      assert.throws(
        () => file.takeSnapshotUpdates(),
        /successful execution and disposal/
      )
      await assert.rejects(access(join(directory, '__snapshots__')))
    } finally {
      await file.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  }
})

it('keeps failed body snapshot publication refused without actual profile admission', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-failed-body-default-'))
  const file = initializeTestFile({
    fileId: 'failed-body-default',
    filePath: join(directory, 'file.test.ts'),
    updateSnapshots: true,
  })
  try {
    await file.collect(async () => {
      test('failed body', ({ expect: local }) => {
        local('recorded value').toMatchSnapshot('value')
        throw new Error('ordinary body failure')
      })
    })
    const result = await file.run(options())
    assert.equal(result.cases[0].status, 'failed')
    assert.deepEqual(result.errors, [])
    assert.equal(result.interrupted, false)
    await file.dispose()
    assert.equal(file.canPublishSnapshots(), false)
    assert.throws(
      () => file.takeSnapshotUpdates(),
      /successful execution and disposal/
    )
    await assert.rejects(access(join(directory, '__snapshots__')))
  } finally {
    await file.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})

if (process.env.NEXT_TEST_DEFERRED_SNAPSHOT_CONTRACT === '1') {
  it('admits only owned settled body assertion emissions with the existing profile flag', async () => {
    for (const admitted of [false, true])
      for (const kind of [
        'soft',
        'under',
        'over',
        'promise',
        'consumption',
      ] as const) {
        const directory = await mkdtemp(join(tmpdir(), 'next-deferred-body-'))
        const file = initializeTestFile({
          fileId: kind,
          filePath: join(directory, 'file.test.ts'),
          updateSnapshots: true,
          snapshotBodyFailures: admitted,
        })
        try {
          await file.collect(async () => {
            test('owned body', ({ expect }) => {
              if (kind === 'under') expect.assertions(2)
              if (kind === 'over') expect.assertions(0)
              expect('owned value').toMatchSnapshot('value')
              if (kind === 'soft') expect.soft(1).toBe(2)
              if (kind === 'promise' || kind === 'consumption')
                expect(Promise.resolve(1)).resolves.toBe(
                  kind === 'promise' ? 2 : 1
                )
            })
            test('following body', ({ expect }) => {
              expect('following value').toMatchSnapshot('value')
            })
          })
          const result = await file.run(options())
          assert.deepEqual(
            result.cases.map(({ status }) => status),
            ['failed', 'passed']
          )
          assert.deepEqual(result.errors, [])
          assert.equal(result.interrupted, false)
          assert(
            result.cases[0].errors.every(({ phase }) => phase === 'assertion')
          )
          for (const failure of result.cases[0].errors) {
            assert.equal(
              Reflect.ownKeys(failure).includes('snapshotBodyAssertion'),
              false
            )
            assert.equal(
              Reflect.ownKeys(failure.error as object).includes(
                'snapshotBodyAssertion'
              ),
              false
            )
          }
          assert.equal(file.canPublishSnapshots(), false)
          await file.dispose()
          assert.equal(file.canPublishSnapshots(), admitted, kind)
          if (admitted) {
            const updates = file.takeSnapshotUpdates()
            assert.equal(updates.length, 1)
            assert.match(updates[0].content!, /owned value/)
            assert.match(updates[0].content!, /following value/)
          } else
            assert.throws(
              () => file.takeSnapshotUpdates(),
              /successful execution and disposal/
            )
          await assert.rejects(access(join(directory, '__snapshots__')))
        } finally {
          await file.dispose()
          await rm(directory, { recursive: true, force: true })
        }
      }
  })

  it('refuses hook, fixture, cleanup and setup-ancestry assertion origins', async () => {
    const {
      beforeEach,
      onTestFinished,
      expect: globalExpect,
    } = await import('next/dist/experimental/testing/vitest')
    for (const kind of [
      'before-soft',
      'mixed',
      'before-count',
      'before-promise',
      'after-soft',
      'cleanup-soft',
      'listener-soft',
      'ancestry',
      'fixture-setup',
      'fixture-cleanup',
    ] as const) {
      const directory = await mkdtemp(join(tmpdir(), 'next-nonbody-assertion-'))
      const file = initializeTestFile({
        fileId: kind,
        filePath: join(directory, 'file.test.ts'),
        updateSnapshots: true,
        snapshotBodyFailures: true,
      })
      let release!: () => void
      let continuation: Promise<void> | undefined
      try {
        await file.collect(async () => {
          if (kind === 'before-soft' || kind === 'mixed')
            beforeEach(({ expect }) => {
              expect.soft(1).toBe(2)
            })
          if (kind === 'before-count')
            beforeEach(({ expect }) => {
              expect.assertions(2)
            })
          if (kind === 'before-promise')
            beforeEach(({ expect }) => {
              expect(Promise.resolve(1)).resolves.toBe(2)
            })
          if (kind === 'after-soft')
            afterEach(({ expect }) => {
              expect.soft(1).toBe(2)
            })
          if (kind === 'cleanup-soft')
            beforeEach(({ expect }) => () => {
              expect.soft(1).toBe(2)
            })
          if (kind === 'ancestry')
            beforeEach(({ expect }) => {
              continuation = new Promise<void>((resolve) => {
                release = resolve
              }).then(() => {
                expect.soft(1).toBe(2)
              })
            })
          const fixture =
            kind === 'fixture-setup' || kind === 'fixture-cleanup'
              ? test.extend({
                  // eslint-disable-next-line no-empty-pattern -- This fixture has no dependencies.
                  value: async ({}, provide) => {
                    if (kind === 'fixture-setup') globalExpect.soft(1).toBe(2)
                    await provide('owned value')
                    if (kind === 'fixture-cleanup') globalExpect.soft(1).toBe(2)
                  },
                })
              : test.extend({ value: 'owned value' })
          fixture('owned body', async ({ expect, value }) => {
            expect(value).toMatchSnapshot('value')
            if (kind === 'mixed') expect.soft(3).toBe(4)
            if (kind === 'listener-soft')
              onTestFinished(() => {
                expect.soft(1).toBe(2)
              })
            if (kind === 'ancestry') {
              release()
              await continuation
            }
          })
        })
        const result = await file.run(options())
        assert.equal(result.cases[0].status, 'failed', kind)
        assert.equal(result.interrupted, false, kind)
        assert.deepEqual(result.errors, [])
        for (const failure of result.cases[0].errors)
          assert.equal(
            Reflect.ownKeys(failure).includes('snapshotBodyAssertion'),
            false
          )
        await file.dispose()
        assert.equal(file.canPublishSnapshots(), false, kind)
        assert.throws(
          () => file.takeSnapshotUpdates(),
          /successful execution and disposal/
        )
      } finally {
        release?.()
        await continuation
        await file.dispose()
        await rm(directory, { recursive: true, force: true })
      }
    }
  })

  it('retains cancellation, deadline, late-owner and external finalizer vetoes', async () => {
    const { onTestFinished } = await import(
      'next/dist/experimental/testing/vitest'
    )
    for (const kind of [
      'cancel',
      'timeout',
      'assertion-deadline',
      'late',
      'external',
    ] as const) {
      const directory = await mkdtemp(
        join(tmpdir(), 'next-deferred-assertion-veto-')
      )
      const controller = new AbortController()
      const external = new Error('external finalization failure')
      const ownFields = Reflect.ownKeys(external)
      let late: Promise<unknown> | undefined
      let releaseLate: (() => void) | undefined
      let settleAssertion: ((value: number) => void) | undefined
      const file = initializeTestFile({
        fileId: kind,
        filePath: join(directory, 'file.test.ts'),
        updateSnapshots: true,
        snapshotBodyFailures: true,
        ...(kind === 'assertion-deadline' ? { hookTimeout: 30 } : {}),
      })
      try {
        await file.collect(async () => {
          if (kind === 'assertion-deadline')
            afterEach(async () => {
              settleAssertion!(1)
              await Promise.resolve()
            })
          test(
            'owned body',
            { timeout: kind === 'timeout' ? 50 : 5000 },
            async ({ expect, signal }) => {
              expect('owned value').toMatchSnapshot('value')
              expect.soft(1).toBe(2)
              if (kind === 'assertion-deadline')
                expect(
                  new Promise<number>((resolve) => {
                    settleAssertion = resolve
                  })
                ).resolves.toBe(1)
              if (kind === 'cancel')
                controller.abort(new Error('test cancellation'))
              if (kind === 'late')
                onTestFinished(() => {
                  late = new Promise<void>((resolve) => {
                    releaseLate = resolve
                  }).then(() => expect(1).toBe(1))
                })
              if (kind === 'timeout')
                await new Promise<void>((resolve) =>
                  signal.addEventListener('abort', () => resolve(), {
                    once: true,
                  })
                )
            }
          )
        })
        const result = await file.run({
          ...options(),
          signal: controller.signal,
          ...(kind === 'assertion-deadline' ? { hookTimeout: 30 } : {}),
          ...(kind === 'external'
            ? {
                beginAttempt: () => ({
                  async finishTest() {
                    throw external
                  },
                  async finalize() {},
                  async dispose() {},
                }),
              }
            : {}),
        })
        if (
          kind === 'cancel' ||
          kind === 'timeout' ||
          kind === 'assertion-deadline'
        )
          assert.equal(result.interrupted, true)
        if (kind === 'late') {
          releaseLate!()
          await assert.rejects(late!, /closed attempt scope/)
        }
        assert.deepEqual(Reflect.ownKeys(external), ownFields)
        if (kind === 'late') await assert.rejects(file.dispose())
        else await file.dispose()
        assert.equal(file.canPublishSnapshots(), false, kind)
        assert.throws(
          () => file.takeSnapshotUpdates(),
          /successful execution and disposal/
        )
      } finally {
        await file.dispose()
        await rm(directory, { recursive: true, force: true })
      }
    }
  })
}
