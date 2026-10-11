import { createAsyncScope } from './async-context'
import { createFixtureFile } from './fixtures'
import {
  selectedCases,
  type Cleanup,
  type TestCase,
  type TestBody,
  type TestContext,
  type TestSuite,
} from './collector'

export interface AttemptContext extends TestContext {
  readonly id: string
  readonly fileId: string
  readonly testId: string
  /** Full ancestor-qualified test name, used by snapshots. */
  readonly name: string
  readonly testName?: string
  readonly ancestors?: { id: string; name: string }[]
  readonly mode?: 'run' | 'skip' | 'todo'
  readonly retry: number
  readonly repeat: 0
  onCleanup(cleanup: Cleanup): void
}

export interface AttemptIntegration {
  checkpoint?(): Promise<void>
  finalize(): Promise<void>
  dispose(): Promise<void>
}

export interface SuiteHookContext {
  readonly id: string
  readonly fileId: string
  readonly suiteId: string
  readonly name: string
  readonly hook: 'beforeAll' | 'afterAll' | 'cleanup'
  readonly signal: AbortSignal
}

export interface SuiteHookLifecycle {
  beginHook(
    context: SuiteHookContext
  ): AttemptIntegration | Promise<AttemptIntegration>
  setActiveHook(context: SuiteHookContext | undefined): void
}

export interface RunnerFailure {
  phase:
    | 'beforeAll'
    | 'afterAll'
    | 'beforeEach'
    | 'afterEach'
    | 'test'
    | 'cleanup'
    | 'assertion'
    | 'runtime'
  error: unknown
}

export interface RunnerCaseResult {
  entryId: string
  caseId: string
  attempt: { id: string; retry: number; repeat: 0 }
  name: string
  testName?: string
  ancestors?: { id: string; name: string }[]
  mode?: 'run' | 'skip' | 'todo'
  status: 'passed' | 'failed' | 'skipped' | 'cancelled'
  durationMs: number
  errors: RunnerFailure[]
}

export interface RunnerResult {
  cases: RunnerCaseResult[]
  errors: RunnerFailure[]
  /** An execution timeout poisons the realm even if its last case only failed. */
  interrupted: boolean
}

export interface RunnerOptions {
  runId: string
  signal: AbortSignal
  testTimeout?: number
  hookTimeout?: number
  beginAttempt?(
    context: AttemptContext
  ): AttemptIntegration | Promise<AttemptIntegration>
  onLateFailure?(error: Error): void
  onCaseStart?(context: AttemptContext): void | Promise<void>
  onCaseEnd?(result: RunnerCaseResult): void | Promise<void>
}

class DeadlineError extends Error {}

async function bounded<T>(
  fn: () => T | Promise<T>,
  timeout: number
): Promise<T> {
  if (timeout === 0) return fn()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(fn),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new DeadlineError(`Next test timed out after ${timeout}ms.`)
            ),
          timeout
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export async function runCollected(
  root: TestSuite,
  options: RunnerOptions,
  setActive: (context: AttemptContext | undefined) => void,
  suiteHooks?: SuiteHookLifecycle
): Promise<RunnerResult> {
  const selected = selectedCases(root)
  const result: RunnerResult = { cases: [], errors: [], interrupted: false }
  const onLateFailure =
    options.onLateFailure ??
    ((error: Error) => {
      result.errors.push({ phase: 'runtime', error })
    })
  const fixtureScope = createAsyncScope(
    {
      kind: 'file-fixtures',
      context: { id: `${options.runId}/${root.id}/fixtures`, name: root.name },
    },
    onLateFailure
  )
  const fixtureFile = createFixtureFile((fn) => fixtureScope.run(fn))
  const hookTimeout = options.hookTimeout ?? 10000
  const testTimeout = options.testTimeout ?? 5000
  // A timed-out promise can still be running. Do not run another case in its realm.
  let poisoned = false

  async function capture(
    phase: RunnerFailure['phase'],
    fn: () => unknown | Promise<unknown>,
    errors: RunnerFailure[],
    timeout = hookTimeout
  ) {
    try {
      return await bounded(fn, timeout)
    } catch (error) {
      if (error instanceof DeadlineError) poisoned = true
      errors.push({ phase, error })
    }
  }

  async function clean(stack: Cleanup[], errors: RunnerFailure[]) {
    while (stack.length) await capture('cleanup', stack.pop()!, errors)
  }

  async function invokeSuiteHook(
    context: SuiteHookContext,
    fn: () => unknown | Promise<unknown>,
    errors: RunnerFailure[],
    timeout: number
  ) {
    const asyncScope = createAsyncScope(
      { kind: 'hook', context },
      onLateFailure
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
          const value = await capture(context.hook, fn, errors, timeout)
          // Only setup cleanup functions escape this assertion scope. Returning
          // a Chai assertion would probe its then property after finalization.
          return context.hook === 'beforeAll' && typeof value === 'function'
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
    inheritedErrors: RunnerFailure[]
  ) {
    const name = [...ancestors.map((parent) => parent.name), test.name]
      .filter(Boolean)
      .join(' > ')
    const mode = selected.get(test)
    const reportingAncestors = ancestors
      .filter((parent) => parent !== root && parent.name)
      .map(({ id, name: suiteName }) => ({ id, name: suiteName }))
    const attempts = mode === 'run' ? (test.options.retry ?? 0) + 1 : 1
    for (let retry = 0; retry < attempts; retry++) {
      const start = Date.now()
      const errors = [...inheritedErrors]
      const controller = new AbortController()
      const cleanups: Cleanup[] = []
      const finished: { fn: TestBody; timeout?: number }[] = []
      const failed: { fn: TestBody; timeout?: number }[] = []
      let invokingListeners = false
      let sealed = false
      const onCleanup = (cleanup: Cleanup) => {
        if (sealed)
          throw new Error('Cannot register cleanup after the attempt finished.')
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
      const context: AttemptContext = {
        id: `${options.runId}/${test.id}/${retry}/0`,
        fileId: root.id,
        testId: test.id,
        name,
        testName: test.name,
        ancestors: reportingAncestors,
        mode,
        retry,
        repeat: 0,
        signal: controller.signal,
        onCleanup,
        onTestFinished: (handler, timeout) =>
          registerListener(finished, handler, timeout),
        onTestFailed: (handler, timeout) =>
          registerListener(failed, handler, timeout),
      }
      const caseResult: RunnerCaseResult = {
        entryId: root.id,
        caseId: test.id,
        attempt: { id: context.id, retry, repeat: 0 },
        name,
        testName: test.name,
        ancestors: reportingAncestors,
        mode,
        status: 'passed',
        durationMs: 0,
        errors,
      }
      const abort = () => controller.abort(options.signal.reason)
      options.signal.addEventListener('abort', abort, { once: true })
      if (options.signal.aborted) abort()
      const asyncScope = createAsyncScope(
        { kind: 'attempt', context },
        onLateFailure
      )
      try {
        // eslint-disable-next-line no-loop-func -- Awaited scopes serialize attempts and observe shared realm poisoning.
        await asyncScope.run(async () => {
          try {
            if (mode !== 'run') caseResult.status = 'skipped'
            else if (errors.length) caseResult.status = 'failed'
            else if (poisoned || options.signal.aborted)
              caseResult.status = 'cancelled'
            else {
              setActive(context)
              await options.onCaseStart?.(context)
              let integration: AttemptIntegration | undefined
              const hookCleanups: Cleanup[] = []
              const fixtures = fixtureFile.attempt(test.fixtures, {
                ...context,
              })
              const invoke = (fn: Function) =>
                Object.keys(test.fixtures).length
                  ? fixtures.invoke(fn)
                  : fn(context)
              try {
                integration = await options.beginAttempt?.(context)
                for (const parent of ancestors) {
                  for (const hook of parent.hooks.beforeEach) {
                    const cleanup = await capture(
                      'beforeEach',
                      () => invoke(hook.fn),
                      errors,
                      hook.timeout ?? hookTimeout
                    )
                    if (typeof cleanup === 'function')
                      hookCleanups.push(cleanup as Cleanup)
                    if (errors.length) break
                  }
                  if (errors.length) break
                }
                if (!errors.length && !controller.signal.aborted) {
                  await capture(
                    'test',
                    () => invoke(test.fn!),
                    errors,
                    test.options.timeout ?? testTimeout
                  )
                }
              } catch (error) {
                errors.push({ phase: 'runtime', error })
              } finally {
                if (poisoned) controller.abort(new Error('Attempt timed out.'))
                for (const parent of [...ancestors].reverse()) {
                  for (const hook of [...parent.hooks.afterEach].reverse()) {
                    await capture(
                      'afterEach',
                      () => invoke(hook.fn),
                      errors,
                      hook.timeout ?? hookTimeout
                    )
                  }
                }
                await clean(hookCleanups, errors)
                await clean(fixtures.cleanups, errors)
                await clean(cleanups, errors)
                invokingListeners = true
                for (const listener of finished.reverse()) {
                  await capture(
                    'cleanup',
                    () => listener.fn(context),
                    errors,
                    listener.timeout ?? hookTimeout
                  )
                }
                await clean(cleanups, errors)
                if (integration?.checkpoint) {
                  await capture(
                    'assertion',
                    () => integration!.checkpoint!(),
                    errors
                  )
                }
                if (errors.length) {
                  for (const listener of failed.reverse()) {
                    await capture(
                      'cleanup',
                      () => listener.fn(context),
                      errors,
                      listener.timeout ?? hookTimeout
                    )
                  }
                }
                await clean(cleanups, errors)
                if (integration) {
                  const scope = integration
                  await capture('assertion', () => scope.finalize(), errors)
                  await capture('cleanup', () => scope.dispose(), errors)
                }
              }
              caseResult.status = errors.length
                ? 'failed'
                : controller.signal.aborted
                  ? 'cancelled'
                  : 'passed'
            }
          } finally {
            sealed = true
            controller.abort(new Error('Attempt finished.'))
            options.signal.removeEventListener('abort', abort)
            setActive(undefined)
          }
        })
      } finally {
        asyncScope.close()
      }
      caseResult.durationMs = Date.now() - start
      result.cases.push(caseResult)
      await options.onCaseEnd?.(caseResult)
      if (caseResult.status !== 'failed' || poisoned || inheritedErrors.length)
        break
    }
  }

  async function runSuite(
    node: TestSuite,
    ancestors: TestSuite[],
    inheritedErrors: RunnerFailure[]
  ) {
    ancestors = [...ancestors, node]
    const errors = [...inheritedErrors]
    const cleanups: { fn: Cleanup; index: number; timeout: number }[] = []
    const context: TestContext = {
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
    if (enter) {
      for (const [index, hook] of node.hooks.beforeAll.entries()) {
        const cleanup = await invokeSuiteHook(
          hookContext('beforeAll', index),
          () => hook.fn(context),
          errors,
          hook.timeout ?? hookTimeout
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
    try {
      for (const child of node.children) {
        if (child.type === 'suite') await runSuite(child, ancestors, errors)
        else await runCase(child, ancestors, errors)
      }
    } finally {
      if (enter) {
        const teardownErrors: RunnerFailure[] = []
        for (const [index, hook] of [
          ...node.hooks.afterAll.entries(),
        ].reverse()) {
          await invokeSuiteHook(
            hookContext('afterAll', index),
            () => hook.fn(context),
            teardownErrors,
            hook.timeout ?? hookTimeout
          )
        }
        while (cleanups.length) {
          const cleanup = cleanups.pop()!
          await invokeSuiteHook(
            hookContext('cleanup', cleanup.index),
            cleanup.fn,
            teardownErrors,
            cleanup.timeout
          )
        }
        result.errors.push(...teardownErrors)
      }
    }
  }
  try {
    await runSuite(root, [], [])
  } finally {
    try {
      await fixtureScope.run(() => clean(fixtureFile.cleanups, result.errors))
    } finally {
      fixtureScope.close()
    }
  }
  result.interrupted = poisoned || options.signal.aborted
  return result
}
