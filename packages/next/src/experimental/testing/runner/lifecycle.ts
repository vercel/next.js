import {
  getPublicTestContext,
  invokeTestCallback,
  settleSuiteHookResult,
} from './invocation-platform'
import { registerTaskArtifactRecorder } from './artifacts'
import {
  createTaskTree,
  serializeTaskError,
  type File,
  type Test,
  type Suite,
  type Task,
  type TaskMeta,
  type TestAnnotation,
  type TestAttachment,
  type TestArtifactLocation,
  type TestArtifact,
} from './tasks'
import {
  prepareAnnotationAttachment,
  retainAnnotationAttachment,
} from './annotations'
import type { TestExpect } from '../assertions'
import { processError } from '../../../compiled/next-test-primitives/error'
import { createAsyncScope, getOriginatingAttempt } from './async-context'
import { getFinalCaseResults } from '../reporting/final-cases'
import { shuffle, type TestSequenceOptions } from './sequence'
import {
  configureFixtureCallback,
  createFixtureFile,
  createFixtureWorker,
  type FixtureWorker,
  resolveFixtureDefinitions,
} from './fixtures'

const frameworkDateNow = Date.now.bind(Date)
const frameworkSetTimeout = globalThis.setTimeout.bind(globalThis)
const frameworkClearTimeout = globalThis.clearTimeout.bind(globalThis)
import {
  selectedCases,
  type Cleanup,
  type TestCase,
  type TestBody,
  type TestContext,
  type InternalTestContext,
  type TestOptions,
  type AroundHook,
  type AroundHookName,
  type AroundAllBody,
  type Hook,
  type TestSuite,
} from './collector'

export interface AttemptContext extends InternalTestContext {
  readonly id: string
  readonly fileId: string
  readonly testId: string
  /** Full ancestor-qualified test name, used by snapshots. */
  readonly name: string
  readonly testName?: string
  readonly ancestors?: { id: string; name: string }[]
  readonly mode?: 'run' | 'skip' | 'todo'
  readonly retry: number
  readonly repeat: number
  onAssertionFailure?(error: unknown): void
  onCleanup(cleanup: Cleanup): void
}

export interface AttemptIntegration {
  readonly expect?: TestExpect
  awaitBodyAssertions?<T>(invoke: () => Promise<T>): Promise<T>
  suspend?<T>(runInner: () => Promise<T>): Promise<T>
  finishTest?(failed: boolean): Promise<void>
  consumeBodyAssertionFailure?(error: unknown): boolean
  markSkipped?(): unknown[]
  checkpoint?(): Promise<void>
  finalize(): Promise<void>
  dispose(): Promise<void>
}

export interface SuiteHookContext {
  readonly id: string
  readonly fileId: string
  readonly suiteId: string
  readonly name: string
  readonly hook: 'beforeAll' | 'afterAll' | 'aroundAll' | 'cleanup'
  readonly signal: AbortSignal
}

export interface SuiteHookLifecycle {
  beginFileFixtures?(context: {
    readonly id: string
    readonly name: string
  }): AttemptIntegration | Promise<AttemptIntegration>
  beginHook(
    context: SuiteHookContext
  ): AttemptIntegration | Promise<AttemptIntegration>
  setActiveHook(context: SuiteHookContext | undefined): void
}

export interface RunnerFailure {
  /** Private execution-realm carrier; consumed before diagnostic IPC. */
  readonly registrationError?: Error
  /** Private attempt-owned assertion fact, consumed before returning the result. */
  readonly snapshotBodyAssertion?: string
  phase:
    | 'beforeAll'
    | 'afterAll'
    | 'beforeEach'
    | 'afterEach'
    | 'aroundEach'
    | 'aroundAll'
    | 'test'
    | 'cleanup'
    | 'assertion'
    | 'runtime'
  error: unknown
}

export interface RunnerCaseResult {
  entryId: string
  caseId: string
  attempt: { id: string; retry: number; repeat: number }
  name: string
  testName?: string
  ancestors?: { id: string; name: string }[]
  mode?: 'run' | 'skip' | 'todo'
  pending?: boolean
  bail?: boolean
  note?: string
  status: 'passed' | 'failed' | 'skipped' | 'cancelled'
  durationMs: number
  errors: RunnerFailure[]
  meta?: TaskMeta
  tags?: string[]
  annotations?: TestAnnotation[]
}

export interface RunnerSuiteResult {
  entryId: string
  suiteId: string
  name: string
  ancestors: { id: string; name: string }[]
  mode: 'run' | 'skip' | 'todo'
  status: 'passed' | 'failed' | 'skipped' | 'cancelled'
  durationMs: number
  /** This suite failed setup before entering any descendant. */
  blockedDescendants?: boolean
  errors: RunnerFailure[]
}

export interface RunnerResult {
  cases: RunnerCaseResult[]
  errors: RunnerFailure[]
  /** Unrecovered execution deadlines or cancellation veto publication. */
  interrupted: boolean
}

export interface RunnerOptions {
  retry?: TestOptions['retry']
  bail?: number
  passWithNoTests?: boolean
  allowOnly?: boolean
  filePath?: string
  inject?: TestContext['inject']
  projectName?: string
  projectDir?: string
  attachmentsDir?: string
  getAnnotationLocation?(error: Error): TestArtifactLocation | undefined
  getArtifactLocation?(error: Error): TestArtifactLocation | undefined
  onAnnotation?(
    context: AttemptContext,
    annotation: TestAnnotation
  ): void | Promise<void>
  onArtifact?(
    context: AttemptContext,
    artifact: TestArtifact
  ): void | Promise<void>
  onBrowserArtifact?(
    task: Task,
    artifact: TestArtifact,
    context?: AttemptContext
  ): Promise<TestArtifact>
  runId: string
  signal: AbortSignal
  /** Scheduling only: skip active/queued bodies while actual cleanup still runs. */
  userCancelSignal?: AbortSignal
  testTimeout?: number
  hookTimeout?: number
  testNamePattern?: string | RegExp
  maxConcurrency?: number
  sequence?: TestSequenceOptions
  runWithCasePhase?<T>(
    phase: RunnerFailure['phase'],
    fn: () => T,
    authoredCallback?: boolean
  ): T
  beginAttempt?(
    context: AttemptContext
  ): AttemptIntegration | Promise<AttemptIntegration>
  onLateFailure?(error: Error): void
  onUnhandledFailure?(reason: unknown): void
  /** Actual task graph, before authored fixtures, hooks or bodies start. */
  onCollected?(file: File): void | Promise<void>
  onCaseStart?(context: AttemptContext): void | Promise<void>
  onCaseEnd?(result: RunnerCaseResult): void | Promise<void>
  /** Once per logical case, after retries, repeats and owned attempt closure. */
  onCaseResult?(task: Test, result: RunnerCaseResult): void | Promise<void>
  onSuiteEnd?(result: RunnerSuiteResult, task: Suite): void | Promise<void>
}

class PendingError extends Error {
  readonly code = 'VITEST_PENDING'
  constructor(
    readonly taskId: string,
    readonly note: string | undefined
  ) {
    super('test is skipped; abort execution')
  }
}
Object.defineProperty(PendingError, 'name', {
  value: 'PendingError',
  configurable: true,
})

interface TimedOperation {
  settled: boolean
}
class DeadlineError extends Error {
  declare readonly operation?: TimedOperation
  constructor(message: string, operation?: TimedOperation) {
    super(message)
    Object.defineProperty(this, 'operation', { value: operation })
  }
}

async function bounded<T>(
  fn: () => T | Promise<T>,
  timeout: number,
  onTimeout?: (error: DeadlineError) => void
): Promise<T> {
  if (timeout === 0) return fn()
  let timer: ReturnType<typeof setTimeout> | undefined
  const operation: TimedOperation = { settled: false }
  const work = Promise.resolve().then(fn)
  void work.then(
    () => {
      operation.settled = true
    },
    () => {
      operation.settled = true
    }
  )
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = frameworkSetTimeout(() => {
          const error = new DeadlineError(
            `Next test timed out after ${timeout}ms.`,
            operation
          )
          onTimeout?.(error)
          reject(error)
        }, timeout)
      }),
    ])
  } finally {
    frameworkClearTimeout(timer)
  }
}

export async function runCollected(
  root: TestSuite,
  options: RunnerOptions,
  setActive: (context: AttemptContext | undefined) => void,
  suiteHooks?: SuiteHookLifecycle,
  workerFixtures?: FixtureWorker
): Promise<RunnerResult> {
  const seed = options.sequence?.seed ?? frameworkDateNow()
  const hookSequence = () => options.sequence?.hooks ?? 'stack'
  const ordered = <T>(values: readonly T[]): T[] =>
    hookSequence() === 'stack' ? [...values].reverse() : [...values]
  const maxConcurrency = options.maxConcurrency ?? 5
  if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1)
    throw new TypeError('maxConcurrency must be a positive safe integer.')
  let activeHooks = 0
  const queuedHooks: (() => void)[] = []
  const pendingHooks = new Set<Promise<unknown>>()
  function acquireHookSlot(): Promise<() => void> {
    return new Promise((resolve) => {
      const start = () => {
        activeHooks++
        let released = false
        resolve(() => {
          if (released) return
          released = true
          activeHooks--
          queuedHooks.shift()?.()
        })
      }
      if (activeHooks < maxConcurrency) start()
      else queuedHooks.push(start)
    })
  }
  function limited<T>(fn: () => T | Promise<T>): Promise<T> {
    const work = acquireHookSlot().then(async (release) => {
      try {
        return await fn()
      } finally {
        release()
      }
    })
    pendingHooks.add(work)
    void work.then(
      () => pendingHooks.delete(work),
      () => pendingHooks.delete(work)
    )
    return work
  }
  // Leaf cases and concurrent sibling groups have separate limits. Holding a
  // group slot for a nested suite must never consume its children's case slots.
  function concurrencyLimit() {
    let active = 0
    const queued: (() => void)[] = []
    return async <T>(fn: () => Promise<T>): Promise<T> => {
      await new Promise<void>((resolve) => {
        const start = () => {
          active++
          resolve()
        }
        if (active < maxConcurrency) start()
        else queued.push(start)
      })
      // Reserve the FIFO slot before resuming its original continuation. A
      // queued callback must not inherit the releasing sibling's async owner.
      try {
        return await fn()
      } finally {
        active--
        queued.shift()?.()
      }
    }
  }
  const limitCase = concurrencyLimit()
  const selected = selectedCases(root)
  if (options.testNamePattern !== undefined) {
    const pattern = new RegExp(options.testNamePattern)
    for (const [test, mode] of selected) {
      if (mode === 'skip') continue
      const names = [test.name]
      for (let suite = test.suite; suite !== root; suite = suite.suite!) {
        names.unshift(suite.name)
      }
      if (!pattern.test(names.join(' > '))) selected.set(test, 'skip')
    }
  }
  const result: RunnerResult = { cases: [], errors: [], interrupted: false }
  const onLateFailure =
    options.onLateFailure ??
    ((error: Error) => {
      result.errors.push({ phase: 'runtime', error })
    })
  const fixtureContext = {
    id: `${options.runId}/${root.id}/fixtures`,
    name: root.name,
  }
  let fixtureAssertions: AttemptIntegration | undefined
  const fixtureScope = createAsyncScope(
    {
      kind: 'file-fixtures',
      context: fixtureContext,
    },
    onLateFailure,
    options.onUnhandledFailure
  )
  const workerScope = workerFixtures
    ? undefined
    : createAsyncScope(
        {
          kind: 'worker-fixtures',
          context: { id: `${options.runId}/worker/fixtures`, name: root.name },
        },
        onLateFailure,
        options.onUnhandledFailure
      )
  const worker =
    workerFixtures ?? createFixtureWorker((fn) => workerScope!.run(fn))
  const fixtureFile = createFixtureFile((fn) => fixtureScope.run(fn), worker)
  const hookTimeout = options.hookTimeout ?? 10000
  const testTimeout = options.testTimeout ?? 5000
  const { file: collectedFile, tasks } = createTaskTree(root, {
    ...options,
    testTimeout,
  })
  let artifactFileOpen = true
  const isArtifactFileOpen = () => artifactFileOpen
  const artifactRecorders = new Map<Task, () => void>()
  if (options.onBrowserArtifact)
    for (const task of tasks.values()) {
      if (task.type !== 'suite') continue
      const transport = (artifact: TestArtifact) =>
        options.onBrowserArtifact!(task, artifact)
      artifactRecorders.set(
        task,
        registerTaskArtifactRecorder(task, {
          getLocation:
            options.getArtifactLocation ?? options.getAnnotationLocation,
          projectDir: options.projectDir ?? '',
          isOpen: isArtifactFileOpen,
          transport,
          record: async (artifact) => {
            await transport(artifact)
          },
        })
      )
    }
  // A timed-out promise can still be running. Do not run another case in its realm.
  let poisoned = false
  let hadDeadline = false
  let hadNonBodyDeadline = false
  const bodyDeadlines = { total: 0, accounted: 0 }
  let unrecoverableDeadline = false
  const timedOutOperations = new Set<TimedOperation>()
  let bailed = false
  let failedCases = 0
  // The published collector fails each reachable .only task before execution.
  // A failed suite then skips its descendants without copying its error to them.
  const forbiddenFocus = new Map<TestSuite | TestCase, RunnerFailure>()
  if (options.allowOnly === false) {
    const collectForbiddenFocus = (suite: TestSuite) => {
      for (const child of suite.children) {
        if (child.mode === 'only')
          forbiddenFocus.set(child, {
            phase: 'runtime',
            error: new Error(
              '[Vitest] Unexpected .only modifier. Remove it or pass --allowOnly argument to bypass this error'
            ),
          })
        if (
          child.type === 'suite' &&
          child.mode !== 'skip' &&
          child.mode !== 'todo'
        )
          collectForbiddenFocus(child)
      }
    }
    collectForbiddenFocus(root)
    for (const [node, failure] of forbiddenFocus) {
      const task = tasks.get(node)!
      task.result = {
        state: 'fail',
        errors: [serializeTaskError(failure.error)],
      }
    }
  }

  // Around hooks release the concurrency slot and suspend their deadline while
  // the wrapped operation runs. Setup and teardown each get their own budget.
  async function aroundHooks(
    hooks: AroundHook[],
    name: AroundHookName,
    runInner: () => Promise<void>,
    invoke: (
      hook: AroundHook,
      run: () => Promise<void>,
      index: number
    ) => unknown,
    onTimeout?: (error: Error) => void
  ): Promise<unknown[]> {
    if (!hooks.length) {
      await runInner()
      return []
    }
    const failures: unknown[] = []
    const callback = name === 'aroundEach' ? 'runTest()' : 'runSuite()'
    function deadline(
      timeout: number,
      phase: 'setup' | 'teardown',
      hook: AroundHook,
      operation: TimedOperation
    ) {
      let timer: ReturnType<typeof setTimeout> | undefined
      let expired = false
      const promise = new Promise<never>((_, reject) => {
        if (timeout > 0 && Number.isFinite(timeout))
          timer = frameworkSetTimeout(() => {
            expired = true
            hadNonBodyDeadline = true
            poisoned = true
            timedOutOperations.add(operation)
            if (name === 'aroundAll') unrecoverableDeadline = true
            const error = new DeadlineError(
              `The ${phase} phase of "${name}" hook timed out after ${timeout}ms.`,
              operation
            )
            error.name =
              phase === 'setup'
                ? 'AroundHookSetupError'
                : 'AroundHookTeardownError'
            const registration = hook.registrationErrors?.[phase]
            if (registration) {
              registration.message = error.message
              const stack = registration.stack
              if (stack) error.stack = stack
            }
            onTimeout?.(error)
            reject(error)
          }, timeout)
      })
      return {
        promise,
        expired: () => expired,
        clear: () => frameworkClearTimeout(timer),
      }
    }
    async function next(index: number): Promise<void> {
      if (index === hooks.length) return runInner()
      const hook = hooks[index]
      let called = false
      let resolveCalled!: () => void
      const useCalled = new Promise<void>((resolve) => {
        resolveCalled = resolve
      })
      let resolveReturned!: () => void
      const useReturned = new Promise<void>((resolve) => {
        resolveReturned = resolve
      })
      const setupRelease = await acquireHookSlot()
      const operation: TimedOperation = { settled: false }
      const setup = deadline(
        hook.timeout ?? hookTimeout,
        'setup',
        hook,
        operation
      )
      let teardown: ReturnType<typeof deadline> | undefined
      let teardownRelease: (() => void) | undefined
      const use = async () => {
        if (setup.expired())
          throw new Error('__NEXT_INTERNAL_AROUND_HOOK_ABORT__')
        if (called) {
          const error = new Error(
            `The \`${callback}\` callback was called multiple times in the \`${name}\` hook. The callback can only be called once per hook.`
          )
          error.name = 'AroundHookMultipleCallsError'
          throw error
        }
        called = true
        resolveCalled()
        setup.clear()
        setupRelease()
        await next(index + 1).catch((error) => failures.push(error))
        teardownRelease = await acquireHookSlot()
        teardown = deadline(
          hook.timeout ?? hookTimeout,
          'teardown',
          hook,
          operation
        )
        resolveReturned()
      }
      const complete = Promise.resolve().then(async () => {
        try {
          await invoke(hook, use, index)
          if (!called) {
            const error = new Error(
              `The \`${callback}\` callback was not called in the \`${name}\` hook. Make sure to call \`${callback}\` to run the ${name === 'aroundEach' ? 'test' : 'suite'}.`
            )
            error.name = 'AroundHookSetupError'
            throw error
          }
        } finally {
          setupRelease()
          teardownRelease?.()
          operation.settled = true
        }
      })
      try {
        try {
          await Promise.race([useCalled, complete, setup.promise])
        } finally {
          setupRelease()
          setup.clear()
        }
        await Promise.race([useReturned, complete])
        await Promise.race([complete, teardown?.promise])
      } finally {
        teardownRelease?.()
        teardown?.clear()
      }
    }
    await next(0).catch((error) => failures.push(error))
    return failures
  }

  async function capture(
    phase: RunnerFailure['phase'],
    fn: () => unknown | Promise<unknown>,
    errors: RunnerFailure[],
    timeout = hookTimeout,
    handleControl?: (error: unknown) => boolean,
    onTimeout?: (error: DeadlineError) => void
  ) {
    try {
      return await bounded(fn, timeout, onTimeout)
    } catch (error) {
      if (handleControl?.(error)) return
      if (error instanceof DeadlineError) {
        hadDeadline = true
        if (phase !== 'test') hadNonBodyDeadline = true
        poisoned = true
        if ((phase === 'test' || phase === 'aroundEach') && error.operation)
          timedOutOperations.add(error.operation)
        else unrecoverableDeadline = true
      }
      errors.push(
        ...(Array.isArray(error) ? error : [error]).map((failure) => ({
          phase,
          error: failure,
        }))
      )
    }
  }

  async function clean(
    stack: Cleanup[],
    errors: RunnerFailure[],
    captureCleanup: (
      phase: RunnerFailure['phase'],
      fn: () => unknown | Promise<unknown>,
      errors: RunnerFailure[],
      timeout?: number
    ) => Promise<unknown> = capture,
    order: 'stack' | 'list' | 'parallel' = 'stack',
    shouldStop?: () => boolean,
    timeout = hookTimeout
  ) {
    if (order === 'parallel') {
      const callbacks = stack.splice(0)
      if (callbacks.length)
        await captureCleanup(
          'cleanup',
          () => Promise.all(callbacks.map((fn) => limited(fn))),
          errors,
          0
        )
      return
    }
    while (stack.length) {
      await captureCleanup(
        'cleanup',
        (order === 'stack' ? stack.pop() : stack.shift())!,
        errors,
        timeout
      )
      if (shouldStop?.()) break
    }
  }

  const prepareRegisteredHookDeadline = (
    hook: Hook,
    timeout: number,
    error: DeadlineError
  ) => {
    error.message = `Hook timed out in ${timeout}ms.\nIf this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".`
    const registration = hook.registrationError
    if (registration) {
      registration.message = error.message
      const stack = registration.stack
      if (stack) error.stack = stack
    }
  }

  async function invokeSuiteHook(
    context: SuiteHookContext,
    fn: (
      integration: AttemptIntegration | undefined,
      registeredDeadline: (
        hook: Hook,
        timeout: number
      ) => (error: DeadlineError) => void
    ) => unknown | Promise<unknown>,
    errors: RunnerFailure[],
    timeout: number,
    bodyTimeout = timeout,
    declaration?: Hook
  ) {
    const asyncScope = createAsyncScope(
      { kind: 'hook', context },
      onLateFailure,
      options.onUnhandledFailure
    )
    try {
      return await asyncScope.run(async () => {
        let integration: AttemptIntegration | undefined
        suiteHooks?.setActiveHook(context)
        try {
          await capture(
            context.hook,
            async () => {
              integration = await suiteHooks?.beginHook(context)
            },
            errors,
            timeout
          )
          if (!integration && suiteHooks) return
          const registeredDeadlines: DeadlineError[] = []
          const registeredDeadline =
            (hook: Hook, registeredTimeout: number) =>
            (error: DeadlineError) => {
              prepareRegisteredHookDeadline(hook, registeredTimeout, error)
              registeredDeadlines.push(error)
            }
          const previous = errors.length
          const value = await capture(
            context.hook,
            () => fn(integration, registeredDeadline),
            errors,
            bodyTimeout,
            undefined,
            declaration
              ? registeredDeadline(declaration, bodyTimeout)
              : undefined
          )
          for (const failure of errors.slice(previous)) {
            if (
              registeredDeadlines.some((deadline) => deadline === failure.error)
            )
              Object.defineProperty(failure, 'registrationError', {
                value: failure.error,
              })
          }
          // Only setup cleanup functions escape this assertion scope. Returning
          // a Chai assertion would probe its then property after finalization.
          return context.hook === 'beforeAll' &&
            (typeof value === 'function' || Array.isArray(value))
            ? value
            : undefined
        } finally {
          if (integration) {
            const scope = integration
            await capture(context.hook, () => scope.finalize(), errors, timeout)
            await capture(context.hook, () => scope.dispose(), errors, timeout)
          }
          suiteHooks?.setActiveHook(undefined)
        }
      })
    } finally {
      asyncScope.close()
    }
  }

  async function runCase(
    test: TestCase,
    ancestors: TestSuite[],
    inheritedErrors: RunnerFailure[],
    collectionBlocked = false
  ) {
    if (test.suite !== ancestors[ancestors.length - 1]) {
      const declarationAncestors: TestSuite[] = []
      for (
        let parent: TestSuite | undefined = test.suite;
        parent;
        parent = parent.suite
      )
        declarationAncestors.unshift(parent)
      ancestors = declarationAncestors
    }
    const name = [...ancestors.map((parent) => parent.name), test.name]
      .filter(Boolean)
      .join(' > ')
    const mode = selected.get(test)
    const reportingAncestors = ancestors
      .filter((parent) => parent !== root && parent.name)
      .map(({ id, name: suiteName }) => ({ id, name: suiteName }))
    const focusFailure = forbiddenFocus.get(test)
    const repeats =
      mode === 'run' && !focusFailure ? (test.options.repeats ?? 0) + 1 : 1
    // The published context owns one signal for the whole test, including retries/repeats.
    const controller = new AbortController()
    const publicTask = tasks.get(test) as Test
    publicTask.mode = mode ?? 'skip'
    let currentContext: AttemptContext | undefined
    let lastAttemptId: string | undefined
    const caseState = {
      timedOut: false,
      recoveredBodyDeadline: false,
      pendingBodyDeadlines: 0,
    }
    const ownedContext = (api = 'test context'): AttemptContext => {
      const origin = getOriginatingAttempt()
      if (!origin || origin !== currentContext || origin.testId !== test.id) {
        // Public context identity survives retries; diagnostics still name the
        // actual internal owner, including after its active slot is cleared.
        const ownerId = currentContext?.id ?? lastAttemptId ?? test.id
        const error = new Error(
          origin
            ? `${api} belongs to a different Next test attempt (${ownerId}).`
            : `Cannot access a test context after its attempt finished (${ownerId}).`
        )
        onLateFailure(error)
        throw error
      }
      return origin
    }
    const rawPublicContext: TestContext & {
      onCleanup: AttemptContext['onCleanup']
    } = {
      inject: ((key: string) =>
        ownedContext().inject(key as never)) as TestContext['inject'],
      task: publicTask,
      get expect() {
        return ownedContext().expect
      },
      annotate: ((...args: unknown[]) =>
        Reflect.apply(
          ownedContext('annotate()').annotate,
          undefined,
          args
        )) as TestContext['annotate'],
      bench: (benchName, fn, benchOptions) =>
        ownedContext().bench(benchName, fn, benchOptions),
      signal: controller.signal,
      skip: ((...args: unknown[]) =>
        Reflect.apply(
          ownedContext('skip()').skip,
          undefined,
          args
        )) as TestContext['skip'],
      onTestFinished: (handler, timeout) =>
        ownedContext().onTestFinished(handler, timeout),
      onTestFailed: (handler, timeout) =>
        ownedContext().onTestFailed(handler, timeout),
      onCleanup: (cleanup) => ownedContext().onCleanup(cleanup),
    }
    const publicContext = getPublicTestContext(rawPublicContext)
    Object.defineProperty(publicContext, 'expect', { enumerable: false })
    const taskStarted = frameworkDateNow()
    if (collectionBlocked) publicTask.result = { state: 'skip' }
    if (mode === 'run')
      publicTask.result = {
        state: 'run',
        startTime: taskStarted,
        retryCount: 0,
      }
    for (let repeat = 0; repeat < repeats; repeat++) {
      const retryOptions = test.options.retry ?? options.retry
      const retries =
        typeof retryOptions === 'number'
          ? retryOptions
          : (retryOptions?.count ?? 0)
      const attempts = mode === 'run' && !focusFailure ? retries + 1 : 1
      for (let retry = 0; retry < attempts; retry++) {
        const start = frameworkDateNow()
        const attemptErrorsStart = publicTask.result?.errors?.length ?? 0
        const errors = [...inheritedErrors]
        if (focusFailure) errors.push(focusFailure)
        const cleanups: Cleanup[] = []
        const finished: { fn: TestBody; timeout?: number }[] = []
        const failed: { fn: TestBody; timeout?: number }[] = []
        let invokingListeners = false
        let sealed = false
        let integration: AttemptIntegration | undefined
        let pending = false
        let cancelledByUser = false
        let skipNote: string | undefined
        let skipSignals = 0
        let currentlyFailed = errors.length > 0
        let attemptTimedOut = false
        const bodyDeadlineOperations = new Set<TimedOperation>()
        const historicalBodyAbort =
          caseState.recoveredBodyDeadline && controller.signal.aborted
        let userCancellationReason: Error | undefined
        let cancelBodyByUser: (() => void) | undefined
        const cancelByUser = () => {
          // Win an active body's race before authored signal listeners run.
          cancelBodyByUser?.()
          userCancellationReason ??= Object.assign(
            new Error('The test run was aborted by the user.'),
            { name: 'TestRunAbortError', reason: 'keyboard-input' }
          )
          controller.abort(userCancellationReason)
          if (publicTask.result?.state === 'run')
            publicTask.result.state = 'skip'
        }
        const isAttemptAborted = () =>
          options.signal.aborted ||
          attemptTimedOut ||
          (controller.signal.aborted &&
            !historicalBodyAbort &&
            controller.signal.reason !== userCancellationReason)
        const forwardedSoftErrors = new Set<unknown>()
        const publishedFailures = new Set<RunnerFailure>()
        const annotationOperations: {
          promise: Promise<TestAnnotation>
          handled: boolean
          checked: boolean
        }[] = []
        if (publicTask.result) {
          publicTask.result.state = errors.length ? 'fail' : 'run'
          publicTask.result.repeatCount = repeat
        }
        const publishFailures = (failures: RunnerFailure[]) => {
          for (const failure of failures) {
            if (publishedFailures.has(failure)) continue
            publishedFailures.add(failure)
            publicTask.result ??= { state: 'fail' }
            publicTask.result.state = 'fail'
            const values =
              failure.error instanceof AggregateError
                ? failure.error.errors
                : [failure.error]
            for (const error of values) {
              if (
                failure.phase === 'assertion' &&
                forwardedSoftErrors.delete(error)
              )
                continue
              ;(publicTask.result.errors ??= []).push(serializeTaskError(error))
            }
          }
        }
        publishFailures(errors)
        const ownedSkips = new WeakSet<object>()
        const skip = ((condition?: boolean | string, note?: string) => {
          if (getOriginatingAttempt() !== context) {
            const error = new Error(
              `skip() belongs to a different Next test attempt (${context.id}).`
            )
            onLateFailure(error)
            throw error
          }
          if (condition === false) return
          pending = true
          if (publicTask.result) publicTask.result.pending = true
          skipNote = typeof condition === 'string' ? condition : note
          const error = new PendingError(test.id, skipNote)
          ownedSkips.add(error)
          throw error
        }) as TestContext['skip']
        const abortHookDeadline = (error: DeadlineError) =>
          controller.abort(error)
        const registeredHookDeadline =
          (hook: Hook, timeout: number) => (error: DeadlineError) => {
            prepareRegisteredHookDeadline(hook, timeout, error)
            abortHookDeadline(error)
          }
        const captureCase = async (
          phase: RunnerFailure['phase'],
          fn: () => unknown | Promise<unknown>,
          failures: RunnerFailure[],
          timeout = hookTimeout,
          declaration?: Hook
        ) => {
          const previous = failures.length
          let handledSkip = false
          let bodyDeadline: DeadlineError | undefined
          let hookDeadline: DeadlineError | undefined
          const hook =
            phase === 'beforeEach' || phase === 'afterEach' ? phase : undefined
          if (hook && publicTask.result) {
            publicTask.result.hooks ??= {}
            if (publicTask.result.hooks[hook] !== 'fail')
              publicTask.result.hooks[hook] = 'run'
          }
          let operation =
            phase === 'test' || !options.runWithCasePhase
              ? fn
              : () => options.runWithCasePhase!(phase, fn)
          const userCancelSignal = options.userCancelSignal
          const userCancellation = {}
          if (phase === 'test' && userCancelSignal) {
            const body = operation
            operation = async () => {
              let cancel!: () => void
              const cancelled = new Promise<never>((_, reject) => {
                cancel = () => reject(userCancellation)
                cancelBodyByUser = cancel
              })
              try {
                return await Promise.race([
                  Promise.resolve().then(body),
                  cancelled,
                ])
              } finally {
                if (cancelBodyByUser === cancel) cancelBodyByUser = undefined
              }
            }
          }
          const value = await capture(
            phase,
            operation,
            failures,
            timeout,
            (error) => {
              if (
                error === userCancellation ||
                (phase === 'test' &&
                  userCancellationReason !== undefined &&
                  error === userCancellationReason)
              ) {
                cancelledByUser = true
                for (const assertionError of integration?.markSkipped?.() ?? [])
                  failures.push({ phase: 'assertion', error: assertionError })
                if (publicTask.result) publicTask.result.state = 'skip'
                return true
              }
              if (error && typeof error === 'object' && ownedSkips.has(error)) {
                skipSignals++
                handledSkip = true
                for (const assertionError of integration?.markSkipped?.() ?? [])
                  failures.push({ phase: 'assertion', error: assertionError })
                currentlyFailed = false
                return true
              }
              if (error instanceof DeadlineError) {
                if (
                  phase === 'beforeEach' ||
                  phase === 'afterEach' ||
                  phase === 'cleanup'
                )
                  hookDeadline = error
                attemptTimedOut = true
                if (phase === 'aroundEach') caseState.timedOut = true
                if (phase === 'test') {
                  bodyDeadline = error
                  bodyDeadlines.total++
                  caseState.pendingBodyDeadlines++
                  caseState.timedOut = true
                  if (error.operation)
                    bodyDeadlineOperations.add(error.operation)
                  error.message = `Test timed out in ${timeout}ms.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".`
                  const registration = test.registrationError
                  if (registration) {
                    // Format the captured Error only after the effective body
                    // timeout is known; its stack retains the real declaration.
                    registration.message = error.message
                    const stack = registration.stack
                    if (stack) error.stack = stack
                  }
                }
              }
              // Even an empty thrown array fails the attempt without diagnostics.
              currentlyFailed = true
              return false
            },
            hook
              ? declaration
                ? registeredHookDeadline(declaration, timeout)
                : abortHookDeadline
              : undefined
          )
          const added = failures.slice(previous)
          if (bodyDeadline && test.registrationError) {
            const failure = added.find(({ error }) => error === bodyDeadline)
            if (failure)
              Object.defineProperty(failure, 'registrationError', {
                value: test.registrationError,
              })
          }
          if (hookDeadline) {
            const failure = added.find(({ error }) => error === hookDeadline)
            if (failure)
              Object.defineProperty(failure, 'registrationError', {
                value: hookDeadline,
              })
          }
          publishFailures(added)
          if (hook && publicTask.result) {
            publicTask.result.hooks ??= {}
            if (added.length) publicTask.result.hooks[hook] = 'fail'
            else if (publicTask.result.hooks[hook] !== 'fail')
              publicTask.result.hooks[hook] = 'pass'
          }
          if (!handledSkip && failures.length > previous) currentlyFailed = true
          return value
        }
        const onCleanup = (cleanup: Cleanup) => {
          if (sealed)
            throw new Error(
              'Cannot register cleanup after the attempt finished.'
            )
          cleanups.push(cleanup)
        }
        const registerListener = (
          stack: typeof finished,
          handler: TestBody,
          timeout?: number
        ) => {
          if (sealed) {
            const error = new Error(
              `Cannot register a listener after the attempt finished (${context.id}).`
            )
            onLateFailure(error)
            throw error
          }
          if (invokingListeners)
            throw new Error(
              'Cannot register test listeners inside a test listener.'
            )
          if (typeof handler !== 'function')
            throw new TypeError('Test listener requires a callback.')
          if (
            timeout !== undefined &&
            (!Number.isSafeInteger(timeout) || timeout < 0)
          )
            throw new TypeError(
              'Test listener timeout must be a non-negative safe integer.'
            )
          stack.push({ fn: handler, timeout })
        }
        const annotate: TestContext['annotate'] = (
          message: string,
          type?: string | TestAttachment,
          attachment?: TestAttachment
        ) => {
          if (getOriginatingAttempt() !== context) {
            const error = new Error(
              `annotate() belongs to a different Next test attempt (${context.id}).`
            )
            onLateFailure(error)
            throw error
          }
          if (sealed || publicTask.result?.state !== 'run')
            throw new Error(
              `Cannot annotate tests outside of the test run. The test "${test.name}" finished running with the "${publicTask.result?.state}" state already.`
            )
          const callsite = new Error()
          Error.captureStackTrace?.(callsite, annotate)
          const annotation: TestAnnotation = {
            message,
            type:
              typeof type === 'object' || type === undefined ? 'notice' : type,
            location: options.getAnnotationLocation?.(callsite),
          }
          const selectedAttachment =
            typeof type === 'object' ? type : attachment
          if (selectedAttachment) {
            prepareAnnotationAttachment(selectedAttachment)
            annotation.attachment = selectedAttachment
          }
          const operation = {
            promise: undefined as unknown as Promise<TestAnnotation>,
            handled: false,
            checked: false,
          }
          operation.promise = Promise.resolve().then(async () => {
            if (annotation.attachment)
              await retainAnnotationAttachment(annotation.attachment, message, {
                projectDir: options.projectDir ?? process.cwd(),
                attachmentsDir: options.attachmentsDir,
              })
            await options.onAnnotation?.(context, annotation)
            if (sealed)
              throw new Error(
                `Annotation belongs to a finished Next test attempt (${context.id}).`
              )
            publicTask.annotations.push(annotation)
            return annotation
          })
          void operation.promise.catch(() => {})
          annotationOperations.push(operation)
          function observe(
            promise: Promise<TestAnnotation>
          ): Promise<TestAnnotation> {
            return new Proxy(promise, {
              get(target, key) {
                if (key === 'then' || key === 'catch' || key === 'finally')
                  return (...args: unknown[]) => {
                    if (
                      (key === 'catch' && typeof args[0] === 'function') ||
                      (key === 'then' && typeof args[1] === 'function')
                    )
                      operation.handled = true
                    return observe(
                      Reflect.apply(Reflect.get(target, key), target, args)
                    )
                  }
                const value = Reflect.get(target, key, target)
                return typeof value === 'function' ? value.bind(target) : value
              },
            })
          }
          return observe(operation.promise)
        }
        const drainAnnotations = async () => {
          const unchecked = annotationOperations.filter(
            (operation) => !operation.checked
          )
          unchecked.forEach((operation) => {
            operation.checked = true
          })
          const results = await Promise.allSettled(
            unchecked.map((operation) => operation.promise)
          )
          const failures = results.flatMap((settled, index) =>
            settled.status === 'rejected' && !unchecked[index].handled
              ? [settled.reason]
              : []
          )
          if (failures.length === 1) throw failures[0]
          if (failures.length)
            throw new AggregateError(failures, 'Test annotations failed')
        }
        const context: AttemptContext = {
          inject: ((key: string) =>
            options.inject?.(key as never)) as TestContext['inject'],
          get expect(): TestExpect {
            const expectation = integration?.expect
            if (!expectation)
              throw new Error(
                'context.expect requires an assertion integration.'
              )
            return expectation
          },
          task: publicTask,
          annotate,
          bench(): never {
            throw new Error(
              "Cannot use the `bench` test-context fixture within a regular test run. Benchmarks are inherently flaky, so Vitest runs them in a dedicated project based on the `benchmark.include` pattern (default `**/*.{bench,benchmark}.?(c|m)[jt]s?(x)`). Move this code to a file matched by `benchmark.include`, and make sure `bench` is destructured from the test context (`test('...', async ({ bench }) => { ... })`) — it is not a top-level export of `vitest`. See https://vitest.dev/guide/benchmarking#stability"
            )
          },
          onAssertionFailure(error: unknown) {
            publicTask.result ??= { state: 'run' }
            publicTask.result.state = 'fail'
            ;(publicTask.result.errors ??= []).push(
              error as ReturnType<typeof processError>
            )
            forwardedSoftErrors.add(error)
          },
          id: `${options.runId}/${test.id}/${retry}/${repeat}`,
          fileId: root.id,
          testId: test.id,
          name,
          testName: test.name,
          ancestors: reportingAncestors,
          mode,
          retry,
          repeat,
          signal: controller.signal,
          skip,
          onCleanup,
          onTestFinished: (handler, timeout) =>
            registerListener(finished, handler, timeout),
          onTestFailed: (handler, timeout) =>
            registerListener(failed, handler, timeout),
        }
        artifactRecorders.get(publicTask)?.()
        artifactRecorders.set(
          publicTask,
          registerTaskArtifactRecorder(publicTask, {
            getLocation:
              options.getArtifactLocation ?? options.getAnnotationLocation,
            projectDir: options.projectDir ?? '',
            attachmentsDir: options.attachmentsDir,
            isOpen: isArtifactFileOpen,
            record: (artifact) => options.onArtifact?.(context, artifact),
            transport: options.onBrowserArtifact
              ? (artifact) =>
                  options.onBrowserArtifact!(publicTask, artifact, context)
              : undefined,
          })
        )
        currentContext = context
        lastAttemptId = context.id
        Object.defineProperty(publicTask, 'context', {
          value: publicContext,
          enumerable: false,
          configurable: true,
        })
        Object.defineProperty(context, 'expect', {
          enumerable: false,
          configurable: false,
        })
        const caseResult: RunnerCaseResult = {
          entryId: root.id,
          caseId: test.id,
          attempt: { id: context.id, retry, repeat },
          name,
          testName: test.name,
          ancestors: reportingAncestors,
          mode,
          status: 'passed',
          durationMs: 0,
          errors,
          meta: publicTask.meta,
          tags: publicTask.tags,
          annotations: publicTask.annotations,
        }
        const abort = () => controller.abort(options.signal.reason)
        options.signal.addEventListener('abort', abort, { once: true })
        if (options.signal.aborted) abort()
        const asyncScope = createAsyncScope(
          { kind: 'attempt', context },
          onLateFailure,
          options.onUnhandledFailure
        )
        try {
          // eslint-disable-next-line no-loop-func -- Awaited scopes serialize attempts and observe shared realm poisoning.
          await asyncScope.run(async () => {
            try {
              if (mode !== 'run') caseResult.status = 'skipped'
              else if (errors.length) caseResult.status = 'failed'
              else if (bailed) {
                caseResult.status = 'cancelled'
                caseResult.bail = true
              } else if (poisoned || options.signal.aborted)
                caseResult.status = 'cancelled'
              else if (options.userCancelSignal?.aborted)
                caseResult.status = 'skipped'
              else {
                setActive(context)
                options.userCancelSignal?.addEventListener(
                  'abort',
                  cancelByUser,
                  { once: true }
                )
                if (options.userCancelSignal?.aborted) cancelByUser()
                await options.onCaseStart?.(context)
                const hookCleanups: Cleanup[] = []
                const definitions = resolveFixtureDefinitions(
                  test.fixtures,
                  test.suite
                )
                const fixtures = fixtureFile.attempt(
                  definitions,
                  publicContext as unknown as Record<string, unknown>,
                  undefined,
                  true
                )
                const invoke = (
                  fn: Function,
                  body = false,
                  authoredHook?: 'beforeEach' | 'afterEach' | 'cleanup'
                ) => {
                  const runCallback =
                    (body || authoredHook) && options.runWithCasePhase
                      ? <T>(callback: () => T) =>
                          options.runWithCasePhase!(
                            body ? 'test' : authoredHook!,
                            callback,
                            authoredHook !== undefined
                          )
                      : undefined
                  if (Object.keys(definitions).length) {
                    const invokeFixtures = () =>
                      fixtures.invoke(fn, runCallback)
                    return body && integration?.awaitBodyAssertions
                      ? integration.awaitBodyAssertions(invokeFixtures)
                      : invokeFixtures()
                  }
                  const callback = () =>
                    invokeTestCallback(fn, publicContext, context)
                  const invokeCallback = () =>
                    runCallback ? runCallback(callback) : callback()
                  return body && integration?.awaitBodyAssertions
                    ? integration.awaitBodyAssertions(async () =>
                        invokeCallback()
                      )
                    : invokeCallback()
                }
                const invokeBeforeEachCleanup = (cleanup: Function) => {
                  const callback = () => Reflect.apply(cleanup, undefined, [])
                  return options.runWithCasePhase
                    ? options.runWithCasePhase('cleanup', callback, true)
                    : callback()
                }
                const integrationErrors = errors.length
                await captureCase(
                  'runtime',
                  async () => {
                    integration = await options.beginAttempt?.(context)
                  },
                  errors
                )
                const runTestInner = async () => {
                  const fixtureCheckpoint = fixtures.cleanups.length
                  try {
                    const beforeEachSequence = hookSequence()
                    for (const parent of ancestors) {
                      if (beforeEachSequence === 'parallel') {
                        if (!parent.hooks.beforeEach.length) continue
                        const callbacks = await captureCase(
                          'beforeEach',
                          () =>
                            Promise.all(
                              parent.hooks.beforeEach.map((hook) =>
                                limited(async () => {
                                  const cleanup = await bounded(
                                    () => invoke(hook.fn, false, 'beforeEach'),
                                    hook.timeout ?? hookTimeout,
                                    registeredHookDeadline(
                                      hook,
                                      hook.timeout ?? hookTimeout
                                    )
                                  )
                                  return typeof cleanup === 'function'
                                    ? () =>
                                        bounded(
                                          () =>
                                            invokeBeforeEachCleanup(cleanup),
                                          hook.timeout ?? hookTimeout,
                                          registeredHookDeadline(
                                            hook,
                                            hook.timeout ?? hookTimeout
                                          )
                                        )
                                    : undefined
                                })
                              )
                            ),
                          errors,
                          0
                        )
                        if (Array.isArray(callbacks))
                          for (const callback of callbacks)
                            if (typeof callback === 'function')
                              hookCleanups.push(callback)
                        if (currentlyFailed || skipSignals) break
                        continue
                      }
                      for (const hook of parent.hooks.beforeEach) {
                        const cleanup = await captureCase(
                          'beforeEach',
                          () => invoke(hook.fn, false, 'beforeEach'),
                          errors,
                          hook.timeout ?? hookTimeout,
                          hook
                        )
                        if (typeof cleanup === 'function')
                          hookCleanups.push(() =>
                            bounded(
                              () => invokeBeforeEachCleanup(cleanup),
                              hook.timeout ?? hookTimeout,
                              registeredHookDeadline(
                                hook,
                                hook.timeout ?? hookTimeout
                              )
                            )
                          )
                        if (currentlyFailed || skipSignals) break
                      }
                      if (currentlyFailed || skipSignals) break
                    }
                    // callSuiteHook publishes its cleanup list only after the
                    // entire inherited beforeEach traversal succeeds.
                    if (currentlyFailed || skipSignals) hookCleanups.length = 0
                    if (
                      !currentlyFailed &&
                      !skipSignals &&
                      !isAttemptAborted()
                    ) {
                      await captureCase(
                        'test',
                        () => invoke(test.fn!, true),
                        errors,
                        test.options.timeout ?? testTimeout
                      )
                    }
                  } catch (error) {
                    errors.push({ phase: 'runtime', error })
                    currentlyFailed = true
                  } finally {
                    if (attemptTimedOut)
                      controller.abort(new Error('Attempt timed out.'))
                    await captureCase('assertion', drainAnnotations, errors)
                    if (integration?.finishTest) {
                      const scope = integration
                      const previous = errors.length
                      await captureCase(
                        'assertion',
                        () =>
                          scope.finishTest!(
                            currentlyFailed ||
                              skipSignals > 0 ||
                              isAttemptAborted()
                          ),
                        errors
                      )
                      // Only this settled native finish emission can supply the
                      // body assertion fact; later checkpoints cannot borrow it.
                      for (const failure of errors.slice(previous)) {
                        if (scope.consumeBodyAssertionFailure?.(failure.error))
                          Object.defineProperty(
                            failure,
                            'snapshotBodyAssertion',
                            {
                              value: context.id,
                              configurable: true,
                            }
                          )
                      }
                    }
                    if (publicTask.result && !currentlyFailed)
                      publicTask.result.state = cancelledByUser
                        ? 'skip'
                        : 'pass'
                    let skippedTeardown = false
                    let failedTeardown = false
                    teardownHooks: for (const parent of [
                      ...ancestors,
                    ].reverse()) {
                      if (hookSequence() === 'parallel') {
                        if (!parent.hooks.afterEach.length) continue
                        const previousSkips = skipSignals
                        const previousErrors = errors.length
                        await captureCase(
                          'afterEach',
                          () =>
                            Promise.all(
                              parent.hooks.afterEach.map((hook) =>
                                limited(() =>
                                  bounded(
                                    () => invoke(hook.fn, false, 'afterEach'),
                                    hook.timeout ?? hookTimeout,
                                    registeredHookDeadline(
                                      hook,
                                      hook.timeout ?? hookTimeout
                                    )
                                  )
                                )
                              )
                            ),
                          errors,
                          0
                        )
                        if (skipSignals !== previousSkips) {
                          skippedTeardown = true
                          break
                        }
                        if (errors.length !== previousErrors) {
                          failedTeardown = true
                          break
                        }
                        continue
                      }
                      for (const hook of ordered(parent.hooks.afterEach)) {
                        const previousSkips = skipSignals
                        const previousErrors = errors.length
                        await captureCase(
                          'afterEach',
                          () => invoke(hook.fn, false, 'afterEach'),
                          errors,
                          hook.timeout ?? hookTimeout,
                          hook
                        )
                        if (skipSignals !== previousSkips) {
                          skippedTeardown = true
                          break teardownHooks
                        }
                        if (errors.length !== previousErrors) {
                          failedTeardown = true
                          break teardownHooks
                        }
                      }
                    }
                    if (!skippedTeardown && !failedTeardown) {
                      const previousErrors = errors.length
                      const previousSkips = skipSignals
                      await clean(
                        hookCleanups,
                        errors,
                        captureCase,
                        hookSequence(),
                        () =>
                          errors.length !== previousErrors ||
                          skipSignals !== previousSkips,
                        0
                      )
                      skippedTeardown = skipSignals !== previousSkips
                      failedTeardown = errors.length !== previousErrors
                      if (!skippedTeardown && !failedTeardown)
                        await clean(
                          fixtures.cleanups.splice(fixtureCheckpoint),
                          errors,
                          captureCase
                        )
                    }
                    await clean(cleanups, errors, captureCase)
                    invokingListeners = true
                    // Published 5.0.4 always runs finished listeners in stack order,
                    // independent of the configured suite/failed-hook sequence.
                    for (const listener of [...finished].reverse()) {
                      await captureCase(
                        'cleanup',
                        () =>
                          limited(() =>
                            bounded(
                              () => listener.fn(publicContext),
                              listener.timeout ?? hookTimeout
                            )
                          ),
                        errors,
                        0
                      )
                    }
                    await clean(cleanups, errors, captureCase)
                    await captureCase('assertion', drainAnnotations, errors)
                    if (integration?.checkpoint) {
                      await captureCase(
                        'assertion',
                        () => integration!.checkpoint!(),
                        errors
                      )
                    }
                    if (currentlyFailed) {
                      const failedSequence = hookSequence()
                      if (failedSequence === 'parallel') {
                        await captureCase(
                          'cleanup',
                          () =>
                            Promise.all(
                              failed.map((listener) =>
                                limited(() =>
                                  bounded(
                                    () => listener.fn(publicContext),
                                    listener.timeout ?? hookTimeout
                                  )
                                )
                              )
                            ),
                          errors,
                          0
                        )
                      }
                      for (const listener of failedSequence === 'parallel'
                        ? []
                        : ordered(failed)) {
                        await captureCase(
                          'cleanup',
                          () => listener.fn(publicContext),
                          errors,
                          listener.timeout ?? hookTimeout
                        )
                      }
                    }
                    await clean(cleanups, errors, captureCase)
                    if (skippedTeardown)
                      await clean(
                        fixtures.cleanups.splice(fixtureCheckpoint),
                        errors,
                        captureCase
                      )
                    await captureCase('assertion', drainAnnotations, errors)
                  }
                }
                const aroundFailures =
                  integrationErrors === errors.length
                    ? await aroundHooks(
                        ancestors.flatMap((parent) => parent.around.aroundEach),
                        'aroundEach',
                        runTestInner,
                        (hook, runTest) => {
                          const wrapper = (values: TestContext) =>
                            hook.fn(
                              runTest,
                              values,
                              tasks.get(test.suite) as Suite
                            )
                          configureFixtureCallback(wrapper, hook.fn, 1)
                          return invoke(wrapper)
                        },
                        (error) => controller.abort(error)
                      )
                    : []
                for (const error of aroundFailures)
                  await captureCase(
                    'aroundEach',
                    () => {
                      throw error
                    },
                    errors,
                    0
                  )
                await clean(fixtures.cleanups, errors, captureCase)
                await captureCase('assertion', drainAnnotations, errors)
                if (integration) {
                  const scope = integration
                  await captureCase('assertion', () => scope.finalize(), errors)
                  await captureCase('cleanup', () => scope.dispose(), errors)
                }
                caseResult.status = currentlyFailed
                  ? 'failed'
                  : isAttemptAborted()
                    ? 'cancelled'
                    : cancelledByUser
                      ? 'skipped'
                      : 'passed'
              }
            } finally {
              sealed = true
              currentContext = undefined
              options.signal.removeEventListener('abort', abort)
              options.userCancelSignal?.removeEventListener(
                'abort',
                cancelByUser
              )
              setActive(undefined)
            }
          })
        } finally {
          asyncScope.close()
        }
        caseResult.durationMs = frameworkDateNow() - start
        const expectedFailureUnexpectedlyPassed =
          mode === 'run' &&
          test.options.fails === true &&
          caseResult.status === 'passed'
        if (
          mode === 'run' &&
          test.options.fails &&
          !focusFailure &&
          inheritedErrors.length === 0
        ) {
          if (expectedFailureUnexpectedlyPassed) {
            caseResult.status = 'failed'
            caseResult.errors.push({
              phase: 'test',
              error: new Error('Expect test to fail'),
            })
          } else if (caseResult.status === 'failed') {
            caseResult.status = 'passed'
            caseResult.errors.length = 0
          }
        }
        if (pending) {
          caseResult.status = 'skipped'
          caseResult.mode = 'skip'
          caseResult.pending = true
          caseResult.note = skipNote
          selected.set(test, 'skip')
        }
        publishFailures(errors)
        if (publicTask.result) {
          if (caseResult.pending) {
            publicTask.mode = 'skip'
            publicTask.result = {
              state: 'skip',
              pending: true,
              note: skipNote,
              duration: frameworkDateNow() - taskStarted,
            }
          } else if (caseResult.status === 'passed' && test.options.fails) {
            publicTask.result.errors?.splice(attemptErrorsStart)
            if (!publicTask.result.errors?.length)
              publicTask.result.errors = undefined
            publicTask.result.state = 'pass'
          } else {
            publicTask.result.state =
              caseResult.status === 'passed'
                ? 'pass'
                : caseResult.status === 'skipped'
                  ? 'skip'
                  : 'fail'
          }
          publicTask.result.duration = frameworkDateNow() - taskStarted
        }
        result.cases.push(caseResult)
        await options.onCaseEnd?.(caseResult)
        // Only this attempt's real body deadlines can admit its next retry or
        // repeat. Foreign and around-hook poison must retain their own fences.
        if (
          bodyDeadlineOperations.size > 0 &&
          !options.signal.aborted &&
          !unrecoverableDeadline &&
          [...bodyDeadlineOperations].every((operation) => operation.settled) &&
          [...timedOutOperations].every((operation) =>
            bodyDeadlineOperations.has(operation)
          )
        ) {
          poisoned = false
          timedOutOperations.clear()
          caseState.recoveredBodyDeadline = true
          if (test.options.fails && caseResult.status === 'passed') {
            // A successful expected-failure attempt accounts only for its own
            // body operations after they and all attempt cleanup have settled.
            bodyDeadlines.accounted += bodyDeadlineOperations.size
            caseState.pendingBodyDeadlines -= bodyDeadlineOperations.size
          }
        }
        if (
          historicalBodyAbort &&
          !test.options.fails &&
          retry > 0 &&
          !attemptTimedOut &&
          caseResult.status === 'passed'
        ) {
          bodyDeadlines.accounted += caseState.pendingBodyDeadlines
          caseState.pendingBodyDeadlines = 0
        }
        if (pending) {
          if (options.onCaseResult)
            await options.onCaseResult(publicTask, caseResult)
          return
        }
        if (
          caseResult.status !== 'failed' ||
          poisoned ||
          inheritedErrors.length
        )
          break
        if (retry + 1 < attempts) {
          const condition =
            typeof retryOptions === 'object'
              ? retryOptions.condition
              : undefined
          // failTask in 5.0.4 expands one AggregateError/array level before
          // selecting its last processed error for the retry condition. Older
          // attempt errors remain available when the latest aggregate is empty.
          const failures = result.cases
            .filter((attempt) => attempt.caseId === test.id)
            .flatMap((attempt) => attempt.errors)
            .flatMap(({ error }) =>
              (Array.isArray(error) ? error : [error]).flatMap((item) =>
                item instanceof AggregateError ? item.errors : [item]
              )
            )
          if (!failures.length) break
          if (condition) {
            const error = processError(failures.at(-1))
            const matches =
              condition instanceof RegExp
                ? condition.test(error.message || '')
                : condition(error)
            if (!matches) break
          }
          const delay =
            typeof retryOptions === 'object' ? (retryOptions.delay ?? 0) : 0
          if (publicTask.result) {
            publicTask.result.state = 'run'
            publicTask.result.retryCount =
              (publicTask.result.retryCount ?? 0) + 1
          }
          if (delay > 0 && !options.signal.aborted) {
            await new Promise<void>((resolve) => {
              let timer: ReturnType<typeof setTimeout>
              const finish = () => {
                frameworkClearTimeout(timer)
                options.signal.removeEventListener('abort', finish)
                resolve()
              }
              options.signal.addEventListener('abort', finish, { once: true })
              timer = frameworkSetTimeout(finish, delay)
            })
          }
        }
      }
    }
    const finalResults = getFinalCaseResults(
      result.cases.filter((value) => value.caseId === test.id)
    )
    if (
      publicTask.result &&
      [...finalResults.values()].some(
        (value) => value.status === 'failed' || value.status === 'cancelled'
      )
    )
      publicTask.result.state = 'fail'
    if (
      options.bail &&
      [...finalResults.values()].some((value) => value.status === 'failed')
    )
      bailed = ++failedCases >= options.bail
    // Recovery is permitted only after the original timed-out body or wrapper settled and
    // the attempt's assertion, fixture, cleanup and async scopes have all closed.
    // Around-hook recovery remains at this logical-case boundary.
    if (
      caseState.timedOut &&
      !unrecoverableDeadline &&
      [...timedOutOperations].every((operation) => operation.settled)
    ) {
      poisoned = false
      timedOutOperations.clear()
    }
    if (options.onCaseResult)
      await options.onCaseResult(publicTask, finalResults.get(test.id)!)
  }

  const suiteResults = new Map<string, RunnerSuiteResult>()
  function hasTests(node: TestSuite): boolean {
    return node.children.some(
      (child) => child.type === 'test' || hasTests(child)
    )
  }

  async function runSuite(
    node: TestSuite,
    ancestors: TestSuite[],
    inheritedErrors: RunnerFailure[],
    inheritedMode: 'run' | 'skip' | 'todo' = 'run',
    collectionBlocked = false
  ) {
    const start = frameworkDateNow()
    const mode =
      inheritedMode !== 'run'
        ? inheritedMode
        : node.mode === 'only'
          ? 'run'
          : node.mode
    const publicSuite = tasks.get(node) as Suite
    publicSuite.mode = mode
    if (collectionBlocked) publicSuite.result = { state: 'skip' }
    if (mode === 'run')
      publicSuite.result = { state: 'run', startTime: frameworkDateNow() }
    ancestors = [...ancestors, node]
    const errors = [...inheritedErrors]
    const focusFailure = forbiddenFocus.get(node)
    if (focusFailure) {
      errors.push(focusFailure)
      if (!collectionBlocked) result.errors.push(focusFailure)
    }
    const blockChildren = collectionBlocked || focusFailure !== undefined
    const markSkipped = (suite: TestSuite) => {
      for (const child of suite.children)
        if (child.type === 'suite') markSkipped(child)
        else selected.set(child, 'skip')
    }
    if (blockChildren) markSkipped(node)
    if (
      mode === 'run' &&
      !poisoned &&
      !options.signal.aborted &&
      !(node === root && options.passWithNoTests) &&
      !hasTests(node)
    ) {
      const failure: RunnerFailure = {
        phase: 'runtime',
        error: new Error(`No test found in suite ${node.name}`),
      }
      errors.push(failure)
      result.errors.push(failure)
    }
    const cleanups: { fn: Cleanup; index: number; timeout: number }[] = []
    const context: TestContext = {
      inject: ((key: string) =>
        options.inject?.(key as never)) as TestContext['inject'],
      get task(): Readonly<Test> {
        throw new Error('context.task requires an active Next test.')
      },
      annotate() {
        throw new Error('annotate() requires an active test.')
      },
      bench(): never {
        throw new Error('context.bench requires an active test.')
      },
      get expect(): TestExpect {
        throw new Error('context.expect requires an active Next test.')
      },
      skip() {
        throw new Error('skip() requires an active test.')
      },
      signal: options.signal,
      onTestFinished() {
        throw new Error('onTestFinished requires an active test.')
      },
      onTestFailed() {
        throw new Error('onTestFailed requires an active test.')
      },
    }
    function runnable(suite: TestSuite): boolean {
      return suite.children.some((child) =>
        child.type === 'suite' ? runnable(child) : selected.get(child) === 'run'
      )
    }
    const enter =
      runnable(node) && !errors.length && !poisoned && !options.signal.aborted
    const hookContext = (
      hook: SuiteHookContext['hook'],
      index: number
    ): SuiteHookContext => ({
      id: `${options.runId}/${node.id}/${hook}/${index}`,
      fileId: root.id,
      suiteId: node.id,
      name: ancestors
        .map((parent) => parent.name)
        .filter(Boolean)
        .join(' > '),
      hook,
      signal: options.signal,
    })
    const invokeSuiteCallback = (
      hook: Hook,
      name: 'beforeAll' | 'afterAll'
    ) => {
      if (hook.fixtures === undefined)
        return settleSuiteHookResult(
          Reflect.apply(hook.fn, undefined, [context, publicSuite]),
          name === 'beforeAll'
        )
      const definitions = resolveFixtureDefinitions(hook.fixtures, node)
      const fixtures = fixtureFile.attempt(definitions, {}, name)
      const wrapper = (values: Record<string, unknown>) =>
        Reflect.apply(hook.fn, undefined, [values, publicSuite])
      configureFixtureCallback(wrapper, hook.fn, 0)
      return settleSuiteHookResult(
        fixtures.invoke(wrapper),
        name === 'beforeAll'
      )
    }
    let blockedDescendants = false
    const runSuiteInner = async () => {
      const setupErrorsStart = errors.length
      const beforeAllSequence = hookSequence()
      if (
        enter &&
        beforeAllSequence === 'parallel' &&
        node.hooks.beforeAll.length
      ) {
        const hooks = node.hooks.beforeAll
        const callbacks = await invokeSuiteHook(
          hookContext('beforeAll', 0),
          (_integration, registeredDeadline) =>
            Promise.all(
              hooks.map((hook) =>
                limited(async () => {
                  const cleanup = await bounded(
                    () => invokeSuiteCallback(hook, 'beforeAll'),
                    hook.timeout ?? hookTimeout,
                    registeredDeadline(hook, hook.timeout ?? hookTimeout)
                  )
                  return typeof cleanup === 'function' ? cleanup : undefined
                })
              )
            ),
          errors,
          hookTimeout,
          0
        )
        if (Array.isArray(callbacks))
          callbacks.forEach((callback, index) => {
            if (typeof callback === 'function')
              cleanups.push({
                fn: callback as Cleanup,
                index,
                timeout: hooks[index].timeout ?? hookTimeout,
              })
          })
      }
      if (enter && beforeAllSequence !== 'parallel') {
        for (const [index, hook] of node.hooks.beforeAll.entries()) {
          const cleanup = await invokeSuiteHook(
            hookContext('beforeAll', index),
            () => invokeSuiteCallback(hook, 'beforeAll'),
            errors,
            hook.timeout ?? hookTimeout,
            hook.timeout ?? hookTimeout,
            hook
          )
          if (typeof cleanup === 'function')
            cleanups.push({
              fn: cleanup as Cleanup,
              index,
              timeout: hook.timeout ?? hookTimeout,
            })
          if (errors.length) break
        }
      }
      // A failed suite setup belongs to the suite. Its descendants have not
      // executed, so retain the suite errors and report those tasks as skipped.
      result.errors.push(...errors.slice(setupErrorsStart))
      blockedDescendants = errors.length > setupErrorsStart
      const skipChildren = blockChildren || errors.length > 0
      if (errors.length) {
        cleanups.length = 0
        markSkipped(node)
      }
      try {
        const runChild = (child: TestSuite | TestCase) =>
          child.type === 'suite'
            ? runSuite(
                child,
                ancestors,
                skipChildren ? [] : errors,
                skipChildren ? 'skip' : mode,
                skipChildren
              )
            : limitCase(() =>
                runCase(
                  child,
                  ancestors,
                  skipChildren ? [] : errors,
                  skipChildren
                )
              )
        // The pinned runner partitions adjacent children by their concurrent
        // flag. An explicit false suite remains a separate shuffle boundary
        // from ordinary tests, whose published concurrent flag is undefined.
        for (let index = 0; index < node.children.length; ) {
          const concurrentFlag = tasks.get(node.children[index])!.concurrent
          const concurrent = concurrentFlag === true
          const groupStart = index++
          while (
            index < node.children.length &&
            tasks.get(node.children[index])!.concurrent === concurrentFlag
          )
            index++
          let group = node.children.slice(groupStart, index)
          if (concurrent) {
            const limitGroup = concurrencyLimit()
            // Observe every sibling before suite teardown, including unexpected
            // host callback failures, so no owned case outlives publication.
            const settled = await Promise.allSettled(
              group.map((child) => limitGroup(() => runChild(child)))
            )
            const failures = settled.flatMap((value) =>
              value.status === 'rejected' ? [value.reason] : []
            )
            if (failures.length === 1) throw failures[0]
            if (failures.length) throw new AggregateError(failures)
          } else {
            if (node.options.shuffle) {
              const suites = group.filter((child) => child.type === 'suite')
              const tests = group.filter((child) => child.type === 'test')
              group = shuffle<(TestSuite | TestCase)[]>(
                [suites, tests],
                seed
              ).flatMap((children) => shuffle(children, seed))
            }
            for (const child of group) await runChild(child)
          }
        }
      } finally {
        if (enter) {
          const teardownErrors: RunnerFailure[] = []
          const afterAllSequence = hookSequence()
          if (afterAllSequence === 'parallel' && node.hooks.afterAll.length)
            await invokeSuiteHook(
              hookContext('afterAll', 0),
              (_integration, registeredDeadline) =>
                Promise.all(
                  node.hooks.afterAll.map((hook) =>
                    limited(() =>
                      bounded(
                        () => invokeSuiteCallback(hook, 'afterAll'),
                        hook.timeout ?? hookTimeout,
                        registeredDeadline(hook, hook.timeout ?? hookTimeout)
                      )
                    )
                  )
                ),
              teardownErrors,
              hookTimeout,
              0
            )
          for (const [index, hook] of afterAllSequence === 'parallel'
            ? []
            : ordered([...node.hooks.afterAll.entries()])) {
            await invokeSuiteHook(
              hookContext('afterAll', index),
              () => invokeSuiteCallback(hook, 'afterAll'),
              teardownErrors,
              hook.timeout ?? hookTimeout,
              hook.timeout ?? hookTimeout,
              hook
            )
            if (teardownErrors.length) break
          }
          const cleanupSequence = hookSequence()
          if (
            !teardownErrors.length &&
            cleanupSequence === 'parallel' &&
            cleanups.length
          ) {
            const callbacks = cleanups.splice(0)
            await invokeSuiteHook(
              hookContext('cleanup', 0),
              () =>
                Promise.all(
                  callbacks.map((callback) =>
                    limited(() => bounded(callback.fn, callback.timeout))
                  )
                ),
              teardownErrors,
              hookTimeout,
              0
            )
          }
          while (cleanups.length && !teardownErrors.length) {
            const cleanup = (
              cleanupSequence === 'stack' ? cleanups.pop() : cleanups.shift()
            )!
            await invokeSuiteHook(
              hookContext('cleanup', cleanup.index),
              cleanup.fn,
              teardownErrors,
              cleanup.timeout
            )
          }
          if (node === root && !teardownErrors.length)
            await fixtureScope.run(() =>
              clean(fixtureFile.cleanups, teardownErrors)
            )
          result.errors.push(...teardownErrors)
          errors.push(...teardownErrors)
        }
      }
    }
    let suiteRan = false
    const aroundFailures = await aroundHooks(
      enter ? node.around.aroundAll : [],
      'aroundAll',
      async () => {
        suiteRan = true
        await runSuiteInner()
      },
      async (hook, executeSuite, index) => {
        const hookErrors: RunnerFailure[] = []
        await invokeSuiteHook(
          hookContext('aroundAll', index),
          (integration) => {
            const suiteFixtures = fixtureFile.attempt(
              resolveFixtureDefinitions(hook.fixtures, node),
              {},
              'aroundAll'
            )
            const invoke = hook.fn as AroundAllBody
            const execute = () =>
              integration?.suspend
                ? integration.suspend(executeSuite)
                : executeSuite()
            const wrapper = (values: Record<string, unknown>) =>
              invoke(execute, values, publicSuite)
            configureFixtureCallback(wrapper, hook.fn, 1)
            return Object.keys(hook.fixtures).length
              ? suiteFixtures.invoke(wrapper)
              : invoke(execute, {}, publicSuite)
          },
          hookErrors,
          0,
          0
        )
        if (hookErrors.length) throw hookErrors.map(({ error }) => error)
      }
    )
    for (const error of aroundFailures) {
      const before = errors.length
      await capture(
        'aroundAll',
        () => {
          throw error
        },
        errors,
        0
      )
      result.errors.push(...errors.slice(before))
    }
    if (!suiteRan) {
      blockedDescendants = aroundFailures.length > 0
      markSkipped(node)
      for (const child of node.children)
        if (child.type === 'suite')
          await runSuite(child, ancestors, [], 'skip', true)
        else await runCase(child, ancestors, [], true)
    }
    const finalCases = getFinalCaseResults(
      result.cases.filter(
        (test) =>
          node === root ||
          test.ancestors?.some((parent) => parent.id === node.id)
      )
    )
    const children = node.children.flatMap((child) => {
      const completed =
        child.type === 'suite' ? suiteResults.get(child.id) : undefined
      return completed ? [completed] : []
    })
    const failed =
      (!collectionBlocked && errors.length > 0) ||
      children.some((child) => child.status === 'failed') ||
      [...finalCases.values()].some((test) => test.status === 'failed')
    const cancelled =
      options.signal.aborted ||
      poisoned ||
      children.some((child) => child.status === 'cancelled')
    const suiteResult: RunnerSuiteResult = {
      entryId: root.id,
      suiteId: node.id,
      name: node.name,
      ancestors: ancestors
        .filter((parent) => parent !== root && parent !== node)
        .map(({ id, name }) => ({ id, name })),
      mode,
      status: collectionBlocked
        ? 'skipped'
        : failed
          ? 'failed'
          : cancelled
            ? 'cancelled'
            : !runnable(node) &&
                !(node === root && options.passWithNoTests && !hasTests(node))
              ? 'skipped'
              : 'passed',
      durationMs: frameworkDateNow() - start,
      blockedDescendants,
      errors,
    }
    if (publicSuite.result) {
      publicSuite.result.state =
        suiteResult.status === 'passed'
          ? 'pass'
          : suiteResult.status === 'skipped'
            ? 'skip'
            : 'fail'
      publicSuite.result.duration = suiteResult.durationMs
      if (errors.length)
        publicSuite.result.errors = errors
          .flatMap(({ error }) =>
            error instanceof AggregateError ? error.errors : [error]
          )
          .map((error) => serializeTaskError(error))
    }
    suiteResults.set(node.id, suiteResult)
    await options.onSuiteEnd?.(suiteResult, publicSuite)
  }
  try {
    if (options.onCollected) await options.onCollected(collectedFile)
    await fixtureScope.run(async () => {
      fixtureAssertions = await suiteHooks?.beginFileFixtures?.(fixtureContext)
    })
    await runSuite(root, [], [])
  } finally {
    try {
      try {
        // Promise.all preserves first-rejection phase transitions. Remaining owned
        // hook work must still settle before fixtures and publication are released.
        while (pendingHooks.size) await Promise.allSettled([...pendingHooks])
        await fixtureScope.run(async () => {
          await clean(fixtureFile.cleanups, result.errors)
          if (fixtureAssertions) {
            const scope = fixtureAssertions
            await capture('cleanup', () => scope.finalize(), result.errors)
            await capture('cleanup', () => scope.dispose(), result.errors)
          }
        })
      } finally {
        fixtureScope.close()
        if (!workerFixtures) {
          try {
            await worker.dispose()
          } catch (error) {
            result.errors.push({ phase: 'cleanup', error })
          } finally {
            workerScope!.close()
          }
        }
      }
    } finally {
      artifactFileOpen = false
      for (const release of artifactRecorders.values()) release()
    }
  }
  // Settled expected-failure attempts account for their own BODY deadlines;
  // ordinary cases require successful later retries of the same logical case.
  // Failed final outcomes and any non-body deadline still veto publication.
  const accountedBodyDeadlines =
    bodyDeadlines.total > 0 &&
    bodyDeadlines.total === bodyDeadlines.accounted &&
    !hadNonBodyDeadline &&
    !unrecoverableDeadline &&
    timedOutOperations.size === 0 &&
    result.errors.length === 0 &&
    [...getFinalCaseResults(result.cases).values()].every(
      ({ status }) => status === 'passed' || status === 'skipped'
    )
  result.interrupted =
    poisoned ||
    options.signal.aborted ||
    (hadDeadline && !accountedBodyDeadlines)
  return result
}
