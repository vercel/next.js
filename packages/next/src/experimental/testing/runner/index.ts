import {
  createAsyncScope,
  assertScopeActive,
  getOriginatingAttempt,
  getOriginatingHook,
} from './async-context'
import { createCollector } from './collector'
import { createAssertionRuntime } from '../assertions'
import {
  runCollected,
  type AttemptContext,
  type RunnerOptions,
  type SuiteHookContext,
} from './lifecycle'

let activeFile: ReturnType<typeof createCollector> | undefined
let assertions: Awaited<ReturnType<typeof createAssertionRuntime>> | undefined

export function getAssertionRuntime() {
  assertScopeActive()
  if (!assertions)
    throw new Error('Assertion APIs require an initialized Next test file.')
  return assertions
}

export function getTestApi() {
  assertScopeActive()
  if (!activeFile)
    throw new Error('Vitest-compatible APIs require explicit Next test mode.')
  return activeFile.api
}

export function getActiveAttempt(): AttemptContext | undefined {
  return getOriginatingAttempt()
}

export function getActiveHook(): SuiteHookContext | undefined {
  return getOriginatingHook()
}

/** Called through the emitted entry, never through a host copy of this module. */
export function initializeTestFile({
  fileId,
  filePath,
  updateSnapshots = false,
}: {
  fileId: string
  filePath: string
  updateSnapshots?: boolean
}) {
  if (activeFile)
    throw new Error('A test file is already active in this realm.')
  if (typeof updateSnapshots !== 'boolean')
    throw new TypeError('updateSnapshots must be a boolean.')
  const collector = createCollector(fileId)
  activeFile = collector
  const lateErrors: Error[] = []
  let reportedLateErrors = 0
  let lateFailureSink: RunnerOptions['onLateFailure']
  const onLateFailure = (error: Error) => {
    lateErrors.push(error)
    lateFailureSink?.(error)
  }
  let fileAssertions: typeof assertions
  let runSucceeded = false
  let disposalSucceeded = false
  let runSignal: AbortSignal | undefined
  let state:
    | 'initialized'
    | 'collecting'
    | 'collected'
    | 'running'
    | 'finished'
    | 'disposed' = 'initialized'
  return {
    api: collector.api,
    filePath,
    async collect(load: () => Promise<unknown>) {
      if (state !== 'initialized')
        throw new Error(`Cannot collect test file in ${state} state.`)
      state = 'collecting'
      const scope = createAsyncScope(
        { kind: 'collection', context: { id: fileId, name: filePath } },
        onLateFailure
      )
      try {
        assertions = await createAssertionRuntime({
          testPath: filePath,
          updateSnapshots,
          getCurrentAttempt: getActiveAttempt,
          getCurrentHook: getActiveHook,
        })
        fileAssertions = assertions
        await scope.run(load)
        state = 'collected'
      } catch (error) {
        state = 'finished'
        throw error
      } finally {
        scope.close()
        collector.close()
      }
    },
    async run(options: RunnerOptions) {
      if (state !== 'collected')
        throw new Error(`Cannot run test file in ${state} state.`)
      state = 'running'
      runSignal = options.signal
      lateFailureSink = options.onLateFailure
      try {
        const runtime = getAssertionRuntime()
        const result = await runCollected(
          collector.root,
          {
            ...options,
            onLateFailure,
            async beginAttempt(context) {
              const assertionScope = runtime.beginAttempt(context)
              let integration:
                | Awaited<
                    ReturnType<NonNullable<RunnerOptions['beginAttempt']>>
                  >
                | undefined
              try {
                integration = await options.beginAttempt?.(context)
              } catch (error) {
                try {
                  await assertionScope.dispose()
                } catch (cleanupError) {
                  throw new AggregateError(
                    [error, cleanupError],
                    'Attempt setup and cleanup failed'
                  )
                }
                throw error
              }
              return {
                async checkpoint() {
                  const errors: unknown[] = []
                  for (const scope of [assertionScope, integration]) {
                    try {
                      await scope?.checkpoint?.()
                    } catch (error) {
                      errors.push(error)
                    }
                  }
                  if (errors.length)
                    throw new AggregateError(
                      errors,
                      'Attempt assertion checkpoint failed'
                    )
                },
                async finalize() {
                  const errors: unknown[] = []
                  for (const scope of [assertionScope, integration]) {
                    try {
                      await scope?.finalize()
                    } catch (error) {
                      errors.push(error)
                    }
                  }
                  if (errors.length === 1) throw errors[0]
                  if (errors.length)
                    throw new AggregateError(
                      errors,
                      'Attempt finalization failed'
                    )
                },
                async dispose() {
                  const errors: unknown[] = []
                  for (const scope of [integration, assertionScope]) {
                    try {
                      await scope?.dispose()
                    } catch (error) {
                      errors.push(error)
                    }
                  }
                  if (errors.length === 1) throw errors[0]
                  if (errors.length)
                    throw new AggregateError(errors, 'Attempt disposal failed')
                },
              }
            },
          },
          () => {},
          {
            beginHook: (context) => runtime.beginHook(context),
            setActiveHook: () => {},
          }
        )
        result.errors.push(
          ...lateErrors.map((error) => ({ phase: 'runtime' as const, error }))
        )
        reportedLateErrors = lateErrors.length
        const finalCases = new Map(
          result.cases.map((test) => [test.caseId, test])
        )
        runSucceeded =
          !result.errors.length &&
          [...finalCases.values()].every(
            (test) => test.status === 'passed' || test.status === 'skipped'
          )
        return result
      } finally {
        state = 'finished'
      }
    },
    async dispose() {
      if (state === 'running' || state === 'collecting')
        throw new Error('Abort and await the active test file before disposal.')
      if (state === 'disposed') return
      collector.close()
      state = 'disposed'
      const errors: unknown[] = []
      let result
      try {
        result = await assertions?.finishFile()
      } catch (error) {
        errors.push(error)
      } finally {
        assertions = undefined
        activeFile = undefined
      }
      errors.push(...lateErrors.slice(reportedLateErrors))
      if (errors.length === 1) throw errors[0]
      if (errors.length)
        throw new AggregateError(errors, 'File disposal failed')
      disposalSucceeded = true
      return result
    },
    takeSnapshotUpdates() {
      if (!updateSnapshots) return []
      if (
        state !== 'disposed' ||
        !disposalSucceeded ||
        !runSucceeded ||
        runSignal?.aborted ||
        lateErrors.length
      ) {
        throw new Error(
          'Snapshot updates require successful execution and disposal without cancellation or late failures.'
        )
      }
      return fileAssertions?.takeSnapshotUpdates() ?? []
    },
  }
}
