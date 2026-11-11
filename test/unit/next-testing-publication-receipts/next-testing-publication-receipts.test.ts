import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it('continues real bodies and teardown after owned capture rejection and preserves result-only packets through blobs', async () => {
  const retained = process.env.NEXT_TESTING_PUBLICATION_RECEIPTS_EVIDENCE
  const temporary =
    retained ?? (await mkdtemp(join(tmpdir(), 'next-publication-receipts-')))
  let complete = false
  try {
    const evidence = retained ?? join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'verify.mjs'), join(__dirname, '../../..'), evidence],
      { timeout: 510000, maxBuffer: 1024 * 1024 }
    )
    const verified = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(verified.profiles).toBe(2)
    expect(verified.actualBodies).toBe(14)
    expect(verified.wholeWorkerRows).toBe(64)
    expect(verified.completeGenuineWorkerModelsExact).toBe(true)
    expect(verified.actualRawPacketRoundtripsExact).toBe(true)
    expect(verified.malformedPacketInputsRefused).toBe(14)
    expect(verified.allOwnersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`Publication receipt evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete && !retained)
      await rm(temporary, { recursive: true, force: true })
  }
}, 540000)

it.each([
  ['undefined', undefined],
  ['null', null],
  ['false', false],
  ['zero', 0],
  ['opaque', { original: true }],
] as const)(
  'owns the actual rejected callback Promise and original %s value without recapturing getters',
  async (_, thrown) => {
    const { createCollector } = await import(
      'next/dist/experimental/testing/runner/collector'
    )
    const { runCollected } = await import(
      'next/dist/experimental/testing/runner/lifecycle'
    )
    const { captureReporterTaskTree } = await import(
      'next/dist/experimental/testing/reporting/live-tasks'
    )
    const { createReporterTaskUpdates } = await import(
      'next/dist/experimental/testing/reporting/task-updates'
    )
    const { createLiveReporterTaskStore } = await import(
      'next/dist/experimental/testing/reporting/custom-reporter-live-tasks'
    )
    const collector = createCollector('actual-rejected-collection', {
      carriedRetryOptions: true,
    })
    let reads = 0,
      body = false,
      handled = false
    const retry = {
      count: 0,
      metadata: {
        get value() {
          ++reads
          throw thrown
        },
      },
    }
    collector.api.test('actual body', { retry } as any, () => {
      body = true
    })
    const receiver = createLiveReporterTaskStore('/project')
    const received: unknown[] = []
    const receiverErrors: unknown[] = []
    const updates = createReporterTaskUpdates({
      carriedRetryOptions: true,
      onUpdate(update) {
        received.push(update)
        if (update.kind !== 'task-packs-after-collection-failure')
          throw new Error('Expected the actual result-only carrier.')
        try {
          receiver.updatePacks('actual-rejected-collection', update.taskPacks)
        } catch (error) {
          receiverErrors.push(error)
          throw error
        }
      },
    })
    let operation: Promise<void> | undefined
    try {
      const result = await runCollected(
        collector.close(),
        {
          runId: 'actual-publication-run',
          filePath: '/project/actual.test.mjs',
          signal: new AbortController().signal,
          onCollected(file) {
            operation = (async () => {
              captureReporterTaskTree(file)
            })()
            return operation
          },
          onCollectedError(file, actual, error) {
            expect(actual).toBe(operation)
            expect(error).toBe(thrown)
            handled = true
            updates.collectionFailed(file, actual, error)
          },
          onCaseStart(context) {
            updates.caseStart(context.testId)
          },
          onCaseResult(task, value) {
            updates.caseResult(task, value)
          },
          onSuiteEnd(_, task) {
            updates.suiteEnd(task)
          },
        },
        () => {}
      )
      expect(result.cases[0].status).toBe('passed')
      expect(body).toBe(true)
      expect(handled).toBe(true)
      let failed = false,
        failure: unknown
      try {
        await updates.finish()
      } catch (error) {
        failed = true
        failure = error
      }
      expect(failed).toBe(true)
      expect(failure).toBeInstanceOf(AggregateError)
      const errors = (failure as AggregateError).errors
      expect(errors.filter((error) => Object.is(error, thrown))).toHaveLength(1)
      expect(receiverErrors.length).toBeGreaterThan(0)
      expect(receiverErrors.every((error) => errors.includes(error))).toBe(true)
      expect(reads).toBe(1)
      expect(received.length).toBeGreaterThan(0)
      expect(receiver.get('actual-rejected-collection')).toBeUndefined()
    } finally {
      updates.dispose()
    }
  }
)

it('keeps a synchronous collected callback throw fatal without invoking its rejection owner', async () => {
  const { createCollector } = await import(
    'next/dist/experimental/testing/runner/collector'
  )
  const { runCollected } = await import(
    'next/dist/experimental/testing/runner/lifecycle'
  )
  const collector = createCollector('sync-publication-fatal')
  let body = false,
    handled = false
  collector.api.test('unopened body', () => {
    body = true
  })
  let original: unknown
  try {
    structuredClone({ actual: () => 42 })
  } catch (error) {
    original = error
  }
  await expect(
    runCollected(
      collector.close(),
      {
        runId: 'sync-publication-run',
        filePath: '/project/sync.test.mjs',
        signal: new AbortController().signal,
        onCollected() {
          throw original
        },
        onCollectedError() {
          handled = true
        },
      },
      () => {}
    )
  ).rejects.toBe(original)
  expect(body).toBe(false)
  expect(handled).toBe(false)
})

it('applies real result/meta packs only to existing records while retaining declaration options and identity', async () => {
  const { createCollector } = await import(
    'next/dist/experimental/testing/runner/collector'
  )
  const { runCollected } = await import(
    'next/dist/experimental/testing/runner/lifecycle'
  )
  const { captureReporterTaskTree } = await import(
    'next/dist/experimental/testing/reporting/live-tasks'
  )
  const { createLiveReporterTaskStore } = await import(
    'next/dist/experimental/testing/reporting/custom-reporter-live-tasks'
  )
  const collector = createCollector('published-pack-owner')
  collector.api.test('published', { retry: { count: 0 } }, ({ task }) => {
    ;(task.meta as any).marker = 'actual live meta'
  })
  const receiver = createLiveReporterTaskStore('/project')
  let retained: ReturnType<typeof receiver.case> | undefined
  await runCollected(
    collector.close(),
    {
      runId: 'published-pack-run',
      filePath: '/project/published.test.mjs',
      signal: new AbortController().signal,
      onCollected(file) {
        const tree = captureReporterTaskTree(file)
        receiver.update(tree)
        retained = receiver.case(file.id, file.tasks[0].id)
        ;(retained.options!.retry as { count: number }).count = 9
      },
      onCaseResult(task) {
        receiver.updatePacks(task.file.id, [
          [task.id, structuredClone({ result: task.result, meta: task.meta })],
        ])
      },
    },
    () => {}
  )
  expect(receiver.case('published-pack-owner', retained!.id)).toBe(retained)
  expect(retained!.state()).toBe('passed')
  expect(retained!.meta()).toEqual({ marker: 'actual live meta' })
  expect(retained!.options!.retry).toEqual({ count: 9 })
})
