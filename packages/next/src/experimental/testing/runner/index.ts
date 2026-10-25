import { validateSynchronousClient } from '../client/validate'
import { loadGlobalTestApi } from './invocation-platform'
export { createModuleImportTracker } from './imports'
import {
  getPublishedTaskLocation,
  getTaskContext,
  type TestTagDefinition,
  type Test,
  type Task,
} from './tasks'
import type { RuntimeOptions } from '../assertions/utilities'
import {
  createAsyncScope,
  getConsoleTask as getOriginatingConsoleTask,
  assertScopeActive,
  getOriginatingAttempt,
  peekOriginatingScope,
  getOriginatingCasePhase,
  runWithCasePhase,
  getOriginatingHook,
  getOriginatingCollection,
  getOriginatingFileFixtures,
  getOriginatingScopeAncestors,
  getOriginatingUnhandledFailureSink,
} from './async-context'
import {
  createCollector,
  hasFocusedTests,
  collectTestCases,
  type CollectorDispatch,
  type SuiteDeclaration,
  type TestBody,
  type TestContext,
} from './collector'
import { createAssertionRuntime } from '../assertions'
import { assertAssertionRuntimeAccess } from '../assertions/assertion-platform'
import { createFixtureWorker, type FixtureWorker } from './fixtures'
import { getFinalCaseResults } from '../reporting/final-cases'
import {
  resolveSnapshotUpdateMode,
  type SnapshotUpdateMode,
} from '../assertions/snapshot-common'
import {
  runCollected,
  type AttemptContext,
  type RunnerOptions,
  type CompletedModuleResult,
  type RunnerOperationObservation,
  type RunnerModuleResultObservation,
  type OperationSettlement,
  type SuiteHookContext,
} from './lifecycle'

let providedContext: Record<string, unknown> = {}
export function getProvidedValue(key: string): unknown {
  getTestApi()
  return providedContext[key]
}

let activeFile: ReturnType<typeof createCollector> | undefined
let publicSuiteAlias: SuiteDeclaration | undefined
let assertions: Awaited<ReturnType<typeof createAssertionRuntime>> | undefined

let publicSelectionEnabled = false
let currentTest: Test | undefined
let consoleTask: { taskId: string; caseId?: string } | undefined

/** Public task selection is separate from the origin that owns private resources. */
export function isPublicTaskSelectionEnabled(): boolean {
  return publicSelectionEnabled
}

export function getCurrentTest(): Test | undefined {
  return publicSelectionEnabled ? currentTest : getOriginatingAttempt()?.task
}

export function getConsoleTask() {
  if (!publicSelectionEnabled) return getOriginatingConsoleTask()
  if (!consoleTask) return undefined
  const origin = getOriginatingConsoleTask()
  return {
    ...consoleTask,
    ...(origin?.caseId === consoleTask.caseId && origin?.attempt
      ? { attempt: origin.attempt }
      : {}),
  }
}

function selectConsoleTask(task: Task) {
  consoleTask = {
    taskId: task.id,
    ...(task.type === 'test' ? { caseId: task.id } : {}),
  }
}

export function registerTestSuiteAlias(alias: SuiteDeclaration): void {
  publicSuiteAlias = alias
}

export function getAssertionRuntime() {
  assertScopeActive()
  if (!assertions)
    throw new Error('Assertion APIs require an initialized Next test file.')
  return assertions
}

export function getAssertionRuntimeForAssertions() {
  assertAssertionRuntimeAccess()
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

export interface TestFileOptions {
  /** Enabled only by actual compiled execution hosts; private callers retain their scopes. */
  publicTaskSelection?: true
  fileId: string
  filePath: string
  tags?: readonly TestTagDefinition[]
  strictTags?: boolean
  globals?: boolean
  getTaskLocation?(error: Error): import('./tasks').TaskLocation | undefined
  onUnhandledRejection?(
    reason: unknown,
    promise?: Promise<unknown>,
    recordedBody?: boolean
  ): void
  resourceLifetime?: 'attempt' | 'file'
  fakeTimers?: import('../assertions/utilities').FakeTimerOptions
  waitForImports?: () => Promise<void>
  clearMocks?: boolean
  mockReset?: boolean
  restoreMocks?: boolean
  unstubGlobals?: boolean
  unstubEnvs?: boolean
  retry?: import('./collector').TestOptions['retry']
  testTimeout?: number
  hookTimeout?: number
  sequence?: RunnerOptions['sequence']
  provide?: Record<string, unknown>
  updateSnapshots?: boolean
  /** Actual isolated Node execution host admission; never a project setting. */
  snapshotBodyFailures?: boolean
  /** Actual isolated Node authored-beforeEach observation; disabled elsewhere. */
  nativeBeforeEachAssertions?: boolean
  /** Actual isolated Node authored-afterEach observation; disabled elsewhere. */
  nativeAfterEachAssertions?: boolean
  /** Actual isolated Node returned-beforeEach cleanup observation only. */
  nativeBeforeEachCleanupAssertions?: boolean
  collectOnly?: boolean
  snapshotUpdateMode?: SnapshotUpdateMode
  mapSnapshotLocation?: Parameters<
    typeof createAssertionRuntime
  >[0]['mapSnapshotLocation']
}

export interface WorkerRuntimeFailure {
  fileId?: string
  error: unknown
}
interface WorkerRuntime {
  id: string
  fixtures: FixtureWorker
  collector?: CollectorDispatch
  failures: WorkerRuntimeFailure[]
  disposed: boolean
  disposalSucceeded: boolean
  fail(error: unknown, fileId?: string): void
}
let activeWorker: WorkerRuntime | undefined

/** Private runtime host for one actual shared compiler/module cohort. */
export function initializeTestWorker({
  workerId,
  onFailure,
}: {
  workerId: string
  onFailure?(failure: WorkerRuntimeFailure): void
}) {
  assertScopeActive()
  if (activeWorker || activeFile)
    throw new Error('A test worker or file is already active in this realm.')
  const failures: WorkerRuntimeFailure[] = []
  const fail = (error: unknown, fileId?: string) => {
    if (
      failures.some(
        (failure) => failure.error === error && failure.fileId === fileId
      )
    )
      return
    const failure = { error, ...(fileId ? { fileId } : {}) }
    failures.push(failure)
    onFailure?.(failure)
  }
  const scope = createAsyncScope(
    {
      kind: 'worker-fixtures',
      context: { id: `${workerId}/fixtures`, name: workerId },
    },
    (error) => fail(error),
    (reason) => fail(reason)
  )
  const context: WorkerRuntime = {
    id: workerId,
    fixtures: createFixtureWorker((fn) => scope.run(fn)),
    failures,
    disposed: false,
    disposalSucceeded: false,
    fail,
  }
  activeWorker = context
  let disposal: Promise<void> | undefined
  return {
    createFile(options: TestFileOptions) {
      if (context.disposed || context.failures.length)
        throw new Error(
          'Test worker cannot accept files after closing or failure.'
        )
      return initializeFile(options, context)
    },
    getFailures(): readonly WorkerRuntimeFailure[] {
      return [...failures]
    },
    dispose(): Promise<void> {
      if (disposal) return disposal
      if (context.collector)
        return Promise.reject(
          new Error('Abort and await the active file before worker disposal.')
        )
      context.disposed = true
      disposal = (async () => {
        try {
          await context.fixtures.dispose()
        } catch (error) {
          fail(error)
        } finally {
          scope.close()
          if (activeWorker === context) activeWorker = undefined
        }
        if (failures.length === 1) throw failures[0].error
        if (failures.length)
          throw new AggregateError(
            failures.map(({ error }) => error),
            'Test worker disposal failed.'
          )
        context.disposalSucceeded = true
      })()
      return disposal
    },
  }
}

/** Route arbitrary rejections through their actual async origin, including closed files. */
export function routeUnhandledRejection(
  reason: unknown,
  promise?: Promise<unknown>
): boolean {
  const sink = getOriginatingUnhandledFailureSink()
  if (sink) {
    sink(reason, promise)
    return true
  }
  if (activeWorker) {
    activeWorker.fail(reason)
    return true
  }
  return false
}

/** Called through the emitted entry, never through a host copy of this module. */
export function initializeTestFile(options: TestFileOptions) {
  return initializeFile(options)
}

function initializeFile(
  {
    publicTaskSelection,
    fileId,
    filePath,
    updateSnapshots = false,
    snapshotBodyFailures = false,
    nativeBeforeEachAssertions = false,
    nativeAfterEachAssertions = false,
    nativeBeforeEachCleanupAssertions = false,
    snapshotUpdateMode,
    collectOnly = false,
    mapSnapshotLocation,
    tags,
    strictTags,
    globals = false,
    getTaskLocation,
    onUnhandledRejection,
    provide = {},
    resourceLifetime = 'file',
    fakeTimers,
    waitForImports,
    clearMocks,
    mockReset,
    restoreMocks,
    unstubGlobals,
    unstubEnvs,
    retry: defaultRetry,
    testTimeout,
    hookTimeout,
    sequence: collectionSequence,
  }: TestFileOptions,
  worker?: WorkerRuntime
) {
  if (activeWorker && activeWorker !== worker)
    throw new Error('An active shared worker owns this realm.')
  if (activeFile)
    throw new Error('A test file is already active in this realm.')
  if (typeof updateSnapshots !== 'boolean')
    throw new TypeError('updateSnapshots must be a boolean.')
  const updateMode = resolveSnapshotUpdateMode({
    updateSnapshots,
    snapshotUpdateMode,
  })
  const runtimeConfig: RuntimeOptions = {
    fakeTimers: {
      loopLimit: 10000,
      shouldClearNativeTimers: true,
      ...fakeTimers,
    },
    clearMocks,
    restoreMocks,
    mockReset,
    testTimeout,
    hookTimeout,
    allowOnly: undefined,
    expect: undefined,
    sequence: undefined,
    maxConcurrency: undefined,
    printConsoleTrace: undefined,
  }
  const collector = createCollector(fileId, {
    filePath,
    getTaskLocation,
    tags,
    strictTags,
    sequence: collectionSequence,
    getRuntimeConfig: () => runtimeConfig,
    injectValue: (name) => provide[name],
    getSuiteAlias: () => publicSuiteAlias,
    getActiveCollector: worker ? () => worker.collector : undefined,
    isCollectingScope: () => getOriginatingCollection()?.id === fileId,
    getTaskExpect(task) {
      if (!fileAssertions)
        throw new Error(
          'Task expectations require their file assertion runtime.'
        )
      return fileAssertions.prepareTaskExpect(task)
    },
  })
  if (defaultRetry !== undefined) collector.root.options.retry = defaultRetry
  activeFile = collector
  publicSelectionEnabled = publicTaskSelection === true
  if (worker) worker.collector = collector
  providedContext = provide
  const globalDescriptors = new Map<string, PropertyDescriptor | undefined>()
  const lateErrors: unknown[] = []
  let reportedLateErrors = 0
  let completedModuleResult: CompletedModuleResult | undefined
  let operationObservation: RunnerOperationObservation | undefined
  let nativeBodyObservation:
    | {
        source: 'node-await-body'
        invocations: Set<{ attemptId: string; settled: boolean }>
      }
    | undefined
  let lateFailureSink: RunnerOptions['onLateFailure']
  const onLateFailure = (error: Error) => {
    lateErrors.push(error)
    worker?.fail(error, fileId)
    lateFailureSink?.(error)
  }
  // Each current execution process owns one isolated file. Keeping this owner
  // outside runCollected makes worker cleanup a separate host disposal phase;
  // file fixtures finish first, and snapshot publication waits for both.
  const workerScope = worker
    ? undefined
    : createAsyncScope(
        {
          kind: 'worker-fixtures',
          context: { id: `${fileId}/worker/fixtures`, name: filePath },
        },
        onLateFailure,
        (reason, promise) => onUnhandledFailure(reason, promise)
      )
  const workerFixtures =
    worker?.fixtures ?? createFixtureWorker((fn) => workerScope!.run(fn))
  const onUnhandledFailure = (reason: unknown, promise?: Promise<unknown>) => {
    const recordedBody =
      snapshotBodyFailures &&
      onUnhandledRejection !== undefined &&
      promise !== undefined &&
      fileAssertions?.observeNativeBodyRejection(reason, promise) === true
    const recordedHook =
      !recordedBody &&
      (nativeBeforeEachAssertions ||
        nativeAfterEachAssertions ||
        nativeBeforeEachCleanupAssertions) &&
      snapshotBodyFailures &&
      onUnhandledRejection !== undefined &&
      promise !== undefined &&
      fileAssertions?.observeNativeHookRejection(reason, promise) === true
    onUnhandledRejection?.(reason, promise, recordedBody)
    if (recordedBody || recordedHook) return
    lateErrors.push(reason)
    worker?.fail(reason, fileId)
    if (reason instanceof Error) lateFailureSink?.(reason)
  }
  let fileAssertions: typeof assertions
  let browserPublicTaskQueues = false
  let snapshotExecutionComplete = false
  let disposalSucceeded = false
  let runSignal: AbortSignal | undefined
  let state:
    | 'initialized'
    | 'collecting'
    | 'collected'
    | 'running'
    | 'finished'
    | 'disposed' = 'initialized'
  const hasCompletedBodyExecution = () =>
    state === 'disposed' &&
    disposalSucceeded &&
    (!worker || (worker.disposalSucceeded && !worker.failures.length)) &&
    snapshotExecutionComplete &&
    fileAssertions?.hasCompleteNativeBodyRejections() === true &&
    !runSignal?.aborted &&
    !lateErrors.length
  const canPublishSnapshots = () =>
    updateMode !== 'none' && hasCompletedBodyExecution()
  return {
    enableBrowserPublicTaskQueues() {
      if (state !== 'initialized')
        throw new Error(
          'Browser public task queues must be enabled before collection.'
        )
      browserPublicTaskQueues = true
    },
    api: collector.api,
    filePath,
    getPublishedTaskLocation,
    async collect(load: () => Promise<unknown>) {
      if (state !== 'initialized')
        throw new Error(`Cannot collect test file in ${state} state.`)
      state = 'collecting'
      currentTest = undefined
      consoleTask = { taskId: fileId }
      const scope = createAsyncScope(
        { kind: 'collection', context: { id: fileId, name: filePath } },
        onLateFailure,
        (reason, promise) => onUnhandledFailure(reason, promise)
      )
      try {
        assertions = await createAssertionRuntime({
          testPath: filePath,
          observeNativeUnhandledAssertions:
            snapshotBodyFailures && onUnhandledRejection !== undefined,
          observePublicTaskQueues: browserPublicTaskQueues,
          observeNativeBeforeEachAssertions:
            nativeBeforeEachAssertions &&
            snapshotBodyFailures &&
            onUnhandledRejection !== undefined,
          observeNativeAfterEachAssertions:
            nativeAfterEachAssertions &&
            snapshotBodyFailures &&
            onUnhandledRejection !== undefined,
          observeNativeBeforeEachCleanupAssertions:
            nativeBeforeEachCleanupAssertions &&
            snapshotBodyFailures &&
            onUnhandledRejection !== undefined,
          collectOnly,
          resourceLifetime,
          fakeTimers,
          runtimeConfig,
          waitForImports,
          clearMocks,
          mockReset,
          restoreMocks,
          unstubGlobals,
          unstubEnvs,
          updateSnapshots,
          snapshotUpdateMode: updateMode,
          mapSnapshotLocation,
          getCurrentAttempt: getActiveAttempt,
          ...(publicTaskSelection ? { getCurrentTest } : {}),
          peekCurrentScope: peekOriginatingScope,
          getCurrentCasePhase: getOriginatingCasePhase,
          getCurrentHook: getActiveHook,
          getCurrentCollection: getOriginatingCollection,
          getCurrentFileFixtures: getOriginatingFileFixtures,
          getCurrentScopeAncestors: getOriginatingScopeAncestors,
        })
        fileAssertions = assertions
        await scope.run(async () => {
          if (globals) {
            const facade = await loadGlobalTestApi()
            for (const name of [
              'suite',
              'test',
              'describe',
              'it',
              'chai',
              'expect',
              'assert',
              'expectTypeOf',
              'assertType',
              'vi',
              'vitest',
              'beforeAll',
              'afterAll',
              'beforeEach',
              'afterEach',
              'onTestFailed',
              'onTestFinished',
              'aroundEach',
              'aroundAll',
            ] as const) {
              globalDescriptors.set(
                name,
                Object.getOwnPropertyDescriptor(globalThis, name)
              )
              Object.defineProperty(globalThis, name, {
                value: facade[name],
                configurable: true,
                writable: true,
                enumerable: true,
              })
            }
          }
          const errors: unknown[] = []
          const collectionAssertions = fileAssertions!.beginCollection({
            id: fileId,
            name: filePath,
          })
          try {
            await load()
          } catch (error) {
            errors.push(error)
          }
          try {
            await collector.settle()
          } catch (error) {
            errors.push(error)
          }
          try {
            await collectionAssertions.finalize()
          } catch (error) {
            errors.push(error)
          }
          try {
            await collectionAssertions.dispose()
          } catch (error) {
            errors.push(error)
          }
          if (errors.length === 1) throw errors[0]
          if (errors.length > 1)
            throw new AggregateError(errors, 'Test file collection failed.')
        })
        // Published Vitest 5.0.4 strips function conditions from the collected
        // task tree before its RPC notification, also changing worker execution.
        // Keep the public file runner aligned with that exact target; the
        // standalone lifecycle still implements the underlying predicate API.
        const sanitizeRetryConditions = (suite: typeof collector.root) => {
          for (const task of [suite, ...suite.children]) {
            const retry = task.options.retry
            if (
              typeof retry === 'object' &&
              typeof retry.condition === 'function'
            )
              task.options.retry = { ...retry, condition: undefined }
            if (task !== suite && task.type === 'suite')
              sanitizeRetryConditions(task)
          }
        }
        sanitizeRetryConditions(collector.root)
        state = 'collected'
      } catch (error) {
        state = 'finished'
        worker?.fail(error, fileId)
        throw error
      } finally {
        scope.close()
        collector.close()
      }
    },
    getCollectedCases(
      options: {
        testNamePattern?: string | RegExp
        allowOnly?: boolean
      } = {}
    ) {
      if (state !== 'collected')
        throw new Error(`Cannot list test file in ${state} state.`)
      return collectTestCases(collector.root, options)
    },
    validateBrowserClient(
      options: Pick<
        RunnerOptions,
        'testNamePattern' | 'allowOnly' | 'retry'
      > = {}
    ) {
      if (state !== 'collected')
        throw new Error(`Cannot validate browser file in ${state} state.`)
      return validateSynchronousClient(collector.root, options)
    },
    async run(options: RunnerOptions) {
      if (collectOnly)
        throw new Error('A collection-only file cannot execute tests.')
      if (state !== 'collected')
        throw new Error(`Cannot run test file in ${state} state.`)
      state = 'running'
      runSignal = options.signal
      lateFailureSink = options.onLateFailure
      let rootDuration: number | undefined
      try {
        const captureCompletedModuleResult =
          options.captureCompletedModuleResult === true
        if (captureCompletedModuleResult)
          operationObservation = { bounded: new Set(), around: new Set() }
        const moduleObservation: RunnerModuleResultObservation | undefined =
          captureCompletedModuleResult ? {} : undefined
        const executionOptions = captureCompletedModuleResult
          ? { ...options }
          : options
        const onSuiteEnd = captureCompletedModuleResult
          ? executionOptions.onSuiteEnd
          : undefined
        const runtime = getAssertionRuntime()
        const result = await runCollected(
          collector.root,
          {
            ...executionOptions,
            ...(publicTaskSelection
              ? {
                  setCurrentTest(task: Test | undefined) {
                    currentTest = task
                    executionOptions.setCurrentTest?.(task)
                  },
                  setCurrentTask(task: Task) {
                    selectConsoleTask(task)
                    executionOptions.setCurrentTask?.(task)
                  },
                }
              : {}),
            ...(captureCompletedModuleResult
              ? {
                  onSuiteEnd(suite, task) {
                    if (suite.suiteId === collector.root.id)
                      rootDuration = suite.durationMs
                    return onSuiteEnd?.(suite, task)
                  },
                }
              : {}),
            get allowOnly() {
              return runtimeConfig.allowOnly ?? options.allowOnly
            },
            get maxConcurrency() {
              return runtimeConfig.maxConcurrency ?? options.maxConcurrency
            },
            get sequence() {
              const sequence =
                options.sequence || runtimeConfig.sequence
                  ? { ...options.sequence, ...runtimeConfig.sequence }
                  : undefined
              const hooks = sequence?.hooks
              return sequence ? { ...sequence, hooks } : undefined
            },
            inject:
              getProvidedValue as import('./collector').TestContext['inject'],
            filePath,
            onLateFailure,
            onUnhandledFailure,
            runWithCasePhase,
            async beginAttempt(context) {
              const assertionScope = runtime.beginAttempt(context)
              if (
                captureCompletedModuleResult &&
                assertionScope.observeBodySettlement
              ) {
                nativeBodyObservation ??= {
                  source: 'node-await-body',
                  invocations: new Set(),
                }
                assertionScope.observeBodySettlement(
                  nativeBodyObservation.invocations
                )
              }
              if (assertionScope.invokeFinishedCallback)
                getTaskContext(context.task).bindListeners({
                  onTestFinished: context.onTestFinished,
                  onTestFailed: context.onTestFailed,
                })
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
              let bodyAssertionFailure: unknown
              return {
                ...(assertionScope.resetPublicTestState
                  ? { beforeTry: assertionScope.resetPublicTestState }
                  : {}),
                ...(assertionScope.awaitBodyAssertions
                  ? { awaitBodyAssertions: assertionScope.awaitBodyAssertions }
                  : {}),
                ...(assertionScope.consumePublicTaskPromises
                  ? {
                      consumePublicTaskPromises:
                        assertionScope.consumePublicTaskPromises,
                    }
                  : {}),
                ...(assertionScope.invokeFinishedCallback
                  ? {
                      async invokeFinishedCallback(
                        fn: TestBody,
                        payload: TestContext
                      ) {
                        bodyAssertionFailure = undefined
                        try {
                          return await assertionScope.invokeFinishedCallback!(
                            fn,
                            payload
                          )
                        } catch (error) {
                          if (assertionScope.consumeBodyFailure(error))
                            bodyAssertionFailure = error
                          throw error
                        }
                      },
                    }
                  : {}),
                get expect() {
                  return assertionScope.expect
                },
                markSkipped: () => assertionScope.markSkipped(),
                consumeBodyAssertionFailure(error: unknown) {
                  if (
                    bodyAssertionFailure === undefined ||
                    bodyAssertionFailure !== error
                  )
                    return false
                  bodyAssertionFailure = undefined
                  return true
                },
                async finishTest(failed: boolean) {
                  bodyAssertionFailure = undefined
                  let nativeBodyFailure: unknown
                  const errors: unknown[] = []
                  for (const scope of [assertionScope, integration]) {
                    try {
                      await scope?.finishTest?.(failed || errors.length > 0)
                    } catch (error) {
                      if (
                        scope === assertionScope &&
                        assertionScope.consumeBodyFailure(error)
                      )
                        nativeBodyFailure = error
                      errors.push(error)
                    }
                  }
                  if (errors.length === 1) {
                    if (nativeBodyFailure === errors[0])
                      bodyAssertionFailure = nativeBodyFailure
                    throw errors[0]
                  }
                  if (errors.length > 1)
                    throw new AggregateError(
                      errors,
                      'Attempt test finalization failed'
                    )
                },
                async checkpoint() {
                  const errors: unknown[] = []
                  let nativeHookFailure: { error: unknown } | undefined
                  for (const scope of [assertionScope, integration]) {
                    try {
                      await scope?.checkpoint?.()
                    } catch (error) {
                      if (
                        scope === assertionScope &&
                        assertionScope.consumeNativeHookCheckpointFailure(error)
                      )
                        nativeHookFailure = { error }
                      errors.push(error)
                    }
                  }
                  if (
                    errors.length === 1 &&
                    nativeHookFailure !== undefined &&
                    nativeHookFailure.error === errors[0]
                  )
                    throw nativeHookFailure.error
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
            beginFileFixtures: (context) => runtime.beginFileFixtures(context),
            setActiveHook: () => {},
          },
          workerFixtures,
          operationObservation,
          moduleObservation
        )
        if (worker && (result.interrupted || options.signal.aborted))
          worker.fail(
            new Error('Shared worker file execution was interrupted.'),
            fileId
          )
        if (worker)
          for (const failure of result.errors)
            if (
              failure.phase === 'cleanup' ||
              failure.phase === 'runtime' ||
              failure.phase === 'afterAll'
            )
              worker.fail(failure.error, fileId)
        result.errors.push(
          ...lateErrors.map((error) => ({ phase: 'runtime' as const, error }))
        )
        reportedLateErrors = lateErrors.length
        const finalCases = getFinalCaseResults(result.cases)
        // A completed body failure changes the logical result, not whether the
        // snapshot owner finished. Hook/resource failures and interruptions still
        // withhold every staged byte.
        snapshotExecutionComplete =
          !result.interrupted &&
          !options.signal.aborted &&
          !result.errors.length &&
          ([...finalCases.values()].every(
            (test) => test.status === 'passed' || test.status === 'skipped'
          ) ||
            (snapshotBodyFailures === true &&
              result.cases.every((test) =>
                test.errors.every(
                  (failure) =>
                    failure.phase === 'test' ||
                    (failure.phase === 'assertion' &&
                      failure.snapshotBodyAssertion === test.attempt.id)
                )
              ) &&
              [...finalCases.values()].every(
                (test) => test.status !== 'cancelled'
              )))
        for (const test of result.cases)
          for (const failure of test.errors)
            delete (failure as { snapshotBodyAssertion?: string })
              .snapshotBodyAssertion
        runtime.finishSnapshotSelection([...finalCases.values()], {
          partial:
            options.testNamePattern !== undefined ||
            hasFocusedTests(collector.root),
          complete: snapshotExecutionComplete,
        })
        if (captureCompletedModuleResult) {
          if (rootDuration === undefined || !Number.isFinite(rootDuration))
            throw new Error(
              'Completed module has no actual root suite duration.'
            )
          completedModuleResult = Object.freeze({
            version: 2,
            durationMs: Math.max(rootDuration, 0),
            containsOnly: hasFocusedTests(collector.root),
            interrupted: result.interrupted,
            finalState: moduleObservation!.finalState ?? null,
          })
        }
        return result
      } catch (error) {
        worker?.fail(error, fileId)
        throw error
      } finally {
        currentTest = undefined
        consoleTask = undefined
        state = 'finished'
      }
    },
    getCompletedModuleResult(): CompletedModuleResult | undefined {
      return completedModuleResult
    },
    getNativeBodySettlement() {
      if (!nativeBodyObservation) return undefined
      return Object.freeze({
        version: 1 as const,
        source: nativeBodyObservation.source,
        invocations: Object.freeze(
          [...nativeBodyObservation.invocations].map((operation) =>
            Object.freeze({
              attemptId: operation.attemptId,
              settled: operation.settled,
            })
          )
        ),
      })
    },
    getOperationSettlement(): OperationSettlement | undefined {
      if (!operationObservation) return undefined
      const read = (operations: RunnerOperationObservation['bounded']) =>
        Object.freeze({
          observed: operations.size,
          pending: [...operations].filter((operation) => !operation.settled)
            .length,
        })
      return Object.freeze({
        version: 1,
        bounded: read(operationObservation.bounded),
        around: read(operationObservation.around),
        pendingHooks: operationObservation.pendingHooks?.size ?? 0,
      })
    },
    async dispose() {
      if (state === 'running' || state === 'collecting')
        throw new Error('Abort and await the active test file before disposal.')
      if (state === 'disposed') return
      collector.close()
      state = 'disposed'
      currentTest = undefined
      consoleTask = undefined
      const errors: unknown[] = []
      let result
      try {
        if (!worker) await workerFixtures.dispose()
      } catch (error) {
        errors.push(error)
      } finally {
        workerScope?.close()
      }
      try {
        result = await assertions?.finishFile()
      } catch (error) {
        errors.push(error)
      } finally {
        assertions = undefined
        activeFile = undefined
        publicSelectionEnabled = false
        if (worker?.collector === collector) worker.collector = undefined
        providedContext = {}
        for (const [name, descriptor] of globalDescriptors) {
          if (descriptor) Object.defineProperty(globalThis, name, descriptor)
          else Reflect.deleteProperty(globalThis, name)
        }
        globalDescriptors.clear()
      }
      errors.push(...lateErrors.slice(reportedLateErrors))
      if (worker) for (const error of errors) worker.fail(error, fileId)
      if (errors.length === 1) throw errors[0]
      if (errors.length)
        throw new AggregateError(errors, 'File disposal failed')
      disposalSucceeded = true
      return result
    },
    getSnapshotSummary() {
      return fileAssertions?.getSnapshotSummary()
    },
    canPublishSnapshots,
    hasCompletedBodyExecution,
    releaseNativeBodyRejectionRecords() {
      fileAssertions?.releaseNativeBodyRejectionRecords()
    },
    takeSnapshotUpdates() {
      if (updateMode === 'none') return []
      if (!canPublishSnapshots()) {
        throw new Error(
          'Snapshot updates require successful execution and disposal without cancellation or late failures.'
        )
      }
      return fileAssertions?.takeSnapshotUpdates() ?? []
    },
  }
}
