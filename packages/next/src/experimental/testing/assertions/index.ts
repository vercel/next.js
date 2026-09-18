/// <reference lib="es2021.promise" />
import { stageSnapshotUpdates } from './snapshots'
import {
  ASYMMETRIC_MATCHERS_OBJECT,
  GLOBAL_EXPECT,
  chai,
  ChaiStyleAssertions,
  JestAsymmetricMatchers,
  JestChaiExpect,
  JestExtend,
  customMatchers,
  equals,
  getState,
  iterableEquality,
  setState,
  recordAsyncExpect,
  subsetEquality,
  type Assertion,
  type ExpectStatic,
  type MockInstance,
  spies,
  SnapshotClient,
  NodeSnapshotEnvironment,
  type SnapshotStateOptions,
} from '../../../compiled/next-test-primitives'

export type { Mock, MockInstance } from '../../../compiled/next-test-primitives'
export type {
  MatcherState,
  MatchersObject,
} from '../../../compiled/next-test-primitives'

/** C owns this identity and the active-context accessor. */
export interface AssertionAttempt {
  id: string
  testId: string
  name: string
}

export interface AssertionHook {
  id: string
  name: string
  hook: 'beforeAll' | 'afterAll' | 'cleanup'
}

// Declaration merging supplies user-defined matcher methods through the facade.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface Matchers<R = void, T = unknown> {}

export interface TestAssertion<T = unknown>
  extends Assertion<void, T>,
    Matchers<void, T> {
  toMatchSnapshot(propertiesOrMessage?: object | string, message?: string): void
}

export interface TestExpect extends ExpectStatic {
  <T>(actual: T, message?: string): TestAssertion<T>
  assertions(count: number): void
  hasAssertions(): void
}

interface AssertionTask {
  type: 'test' | 'suite'
  fullTestName: string
  promises?: Promise<unknown>[]
  onFinished?: (() => void)[]
  result?: { state: string; errors?: unknown[] }
}

let runtimeActive = false
let authorizedMockMutation = 0

/**
 * One instance per execution realm/file. No Vitest worker or runner is loaded.
 * C serializes attempts in the realm and owns all timeout/cancellation decisions.
 */
export async function createAssertionRuntime(options: {
  testPath: string
  getCurrentAttempt: () => AssertionAttempt | undefined
  getCurrentHook?: () => AssertionHook | undefined
  snapshotOptions?: SnapshotStateOptions
  updateSnapshots?: boolean
}) {
  if (
    options.snapshotOptions &&
    options.snapshotOptions.updateSnapshot === 'new'
  ) {
    throw new Error(
      'Snapshot updates support only explicit all mode; new mode is unsupported'
    )
  }
  if (runtimeActive)
    throw new Error('Only one assertion runtime may own a test realm')
  runtimeActive = true
  chai.use(JestExtend)
  chai.use(JestChaiExpect)
  chai.use(ChaiStyleAssertions)
  chai.use(JestAsymmetricMatchers)

  const snapshots = new SnapshotClient({
    isEqual: (received, expected) =>
      equals(received, expected, [iterableEquality, subsetEquality]),
  })
  const snapshotOptions = options.snapshotOptions ?? {
    updateSnapshot: options.updateSnapshots
      ? ('all' as const)
      : ('none' as const),
    snapshotEnvironment: new NodeSnapshotEnvironment(),
  }
  const stagedSnapshots = stageSnapshotUpdates(
    snapshotOptions.snapshotEnvironment,
    snapshotOptions.updateSnapshot === 'all'
  )
  try {
    await snapshots.setup(options.testPath, {
      ...snapshotOptions,
      snapshotEnvironment: stagedSnapshots.environment,
    })
  } catch (error) {
    runtimeActive = false
    throw error
  }

  let active:
    | {
        context: AssertionAttempt | AssertionHook
        kind: 'attempt' | 'hook'
        task: AssertionTask
        finalized: boolean
        mocks: Set<{ mock: MockInstance; restore: boolean }>
      }
    | undefined
  const snapshotTests = new Set<string>()
  let disposed = false
  function current() {
    // Consult origin accessors even after disposal: C records late work here,
    // including when user code retained a direct assertion/spy function.
    const originatingAttempt = options.getCurrentAttempt()
    const originatingHook = options.getCurrentHook?.()
    if (
      disposed ||
      !active ||
      active.finalized ||
      (active.kind === 'attempt'
        ? originatingAttempt?.id
        : originatingHook?.id) !== active.context.id
    ) {
      throw new Error(
        'expect() requires an active Next test attempt or suite hook'
      )
    }
    return active
  }

  function requireScopeAccess() {
    if (active) current()
    else {
      const originatingAttempt = options.getCurrentAttempt()
      const originatingHook = options.getCurrentHook?.()
      if (disposed || originatingAttempt || originatingHook) {
        throw new Error('Cannot access a disposed assertion scope')
      }
    }
  }

  function guardAssertion(
    assertion: object,
    scope: NonNullable<typeof active>
  ) {
    const proxies = new WeakMap<object, object>()
    function check() {
      if (current() !== scope) {
        throw new Error(
          'Assertion was created in a different Next assertion scope'
        )
      }
    }
    function wrap(value: object, receiver?: object): object {
      const cached = proxies.get(value)
      if (cached) return cached
      const proxy = new Proxy(value, {
        get(target, property) {
          check()
          const result = Reflect.get(target, property, target)
          if (typeof result === 'function') return wrap(result, target)
          if (result instanceof chai.Assertion) return wrap(result)
          return result
        },
        apply(target, thisArg, args) {
          check()
          const result = Reflect.apply(
            target as (...args: unknown[]) => unknown,
            receiver ?? thisArg,
            args
          )
          // Promise results retain the primitive's own consumption tracking.
          return result instanceof chai.Assertion ? wrap(result) : result
        },
      })
      proxies.set(value, proxy)
      return proxy
    }
    return wrap(assertion)
  }

  const expect = ((value: unknown, message?: string) => {
    const scope = current()
    const { task } = scope
    const state = getState(expect)
    state.assertionCalls++
    const assertion = chai.expect(value, message)
    // The standalone matcher library uses this small bookkeeping object for
    // async assertions. It does not register or execute a Vitest test.
    chai.util.flag(assertion, 'vitest-test', task)
    return guardAssertion(assertion, scope)
  }) as TestExpect
  Object.assign(expect, chai.expect)
  const globals = globalThis as typeof globalThis & Record<symbol, unknown>
  Object.assign(expect, globals[ASYMMETRIC_MATCHERS_OBJECT])
  expect.getState = () => {
    requireScopeAccess()
    return getState(expect)
  }
  expect.setState = (state) => {
    requireScopeAccess()
    setState(state, expect)
  }
  expect.extend = (matchers) => {
    requireScopeAccess()
    ;(
      chai.expect as unknown as {
        extend(
          expect: ExpectStatic,
          matchers: Parameters<ExpectStatic['extend']>[0]
        ): void
      }
    ).extend(expect, matchers)
    for (const name of Object.keys(matchers)) {
      chai.util.overwriteMethod(
        chai.Assertion.prototype,
        name,
        (original: (...args: unknown[]) => any) => {
          return function customAssertion(
            this: NextTestChai.AssertionStatic,
            ...args: unknown[]
          ) {
            const { task } = current()
            const callsite = new Error()
            Error.captureStackTrace?.(callsite, customAssertion)
            const result = original.apply(this, args)
            if (!result || typeof result.then !== 'function') return result
            const promise = Promise.resolve(result).catch((error: unknown) => {
              if (error instanceof Error && callsite.stack) {
                error.stack = `${error.name}: ${error.message}\n${callsite.stack.split('\n').slice(1).join('\n')}`
              }
              throw error
            })
            return recordAsyncExpect(
              task,
              promise,
              `expect(actual).${name}()`,
              callsite
            )
          }
        }
      )
    }
  }
  expect.assertions = (count) => {
    current()
    const error = new Error()
    Error.captureStackTrace?.(error, expect.assertions)
    setState(
      {
        expectedAssertionsNumber: count,
        expectedAssertionsNumberErrorGen: () => {
          error.message = `expected number of assertions to be ${count}, but got ${getState(expect).assertionCalls}`
          return error
        },
      },
      expect
    )
  }
  expect.hasAssertions = () => {
    current()
    const error = new Error('expected any number of assertion, but got none')
    Error.captureStackTrace?.(error, expect.hasAssertions)
    setState(
      { isExpectingAssertions: true, isExpectingAssertionsError: error },
      expect
    )
  }

  const previousGlobalExpect = Object.getOwnPropertyDescriptor(
    globalThis,
    GLOBAL_EXPECT
  )
  Object.defineProperty(globalThis, GLOBAL_EXPECT, {
    configurable: true,
    writable: true,
    value: expect,
  })
  setState({ assertionCalls: 0 }, expect)
  expect.extend(customMatchers)
  expect.extend({
    toMatchSnapshot(
      received,
      propertiesOrMessage?: object | string,
      message?: string
    ) {
      if (this.isNot) throw new Error('toMatchSnapshot cannot be used with not')
      const { context, kind } = current()
      if (kind !== 'attempt' || !('testId' in context)) {
        throw new Error(
          'Snapshots are unsupported in suite hooks without a test identity'
        )
      }
      snapshotTests.add(context.testId)
      return snapshots.match({
        received,
        filepath: options.testPath,
        name: context.name,
        testId: context.testId,
        properties:
          typeof propertiesOrMessage === 'object'
            ? propertiesOrMessage
            : undefined,
        message:
          typeof propertiesOrMessage === 'string'
            ? propertiesOrMessage
            : message,
        error: new Error(),
        assertionName: 'toMatchSnapshot',
      })
    },
  })

  function mutateMocks<T>(callback: () => T): T {
    authorizedMockMutation++
    try {
      return callback()
    } finally {
      authorizedMockMutation--
    }
  }

  function guardMockMutation(method: (...args: any[]) => any) {
    function guardedMutation(this: unknown, ...args: unknown[]) {
      if (!authorizedMockMutation) requireScopeAccess()
      return mutateMocks(() => Reflect.apply(method, this, args))
    }
    Object.defineProperty(guardedMutation, 'name', {
      value: method.name,
      configurable: true,
    })
    Object.defineProperty(guardedMutation, 'length', {
      value: method.length,
      configurable: true,
    })
    return guardedMutation
  }

  function guardMockMutators(mock: MockInstance) {
    for (const property of Object.keys(mock)) {
      if (!/^mock[A-Z]/.test(property) && property !== 'withImplementation')
        continue
      const method = Reflect.get(mock, property)
      if (typeof method !== 'function') continue
      Reflect.set(mock, property, guardMockMutation(method))
    }
  }

  const fileMocks = new Set<{ mock: MockInstance; restore: boolean }>()
  function drainMocks(mocks: typeof fileMocks): unknown[] {
    const errors: unknown[] = []
    try {
      for (const { mock, restore } of mocks) {
        if (restore) {
          try {
            mutateMocks(() => mock.mockRestore())
          } catch (error) {
            errors.push(error)
          }
        }
        try {
          mutateMocks(() => mock.mockClear())
        } catch (error) {
          errors.push(error)
        }
      }
    } finally {
      mocks.clear()
    }
    return errors
  }

  const registeredMocks = new WeakSet<MockInstance>()
  function trackMock<T extends (...args: any[]) => MockInstance>(
    method: T,
    restore: boolean
  ): T {
    return ((...args: Parameters<T>) => {
      requireScopeAccess()
      const mock = Reflect.apply(method, undefined, args) as MockInstance
      // Setup/hook spies live through the cases and are restored at file disposal.
      // A case only restores the spies created by that case.
      if (!registeredMocks.has(mock)) {
        registeredMocks.add(mock)
        guardMockMutators(mock)
        if (active?.kind === 'attempt') active.mocks.add({ mock, restore })
        else fileMocks.add({ mock, restore })
      }
      return mock
    }) as T
  }

  const trackedSpies: typeof spies = {
    ...spies,
    fn: trackMock(spies.fn, false),
    spyOn: trackMock(spies.spyOn, true),
    createMockInstance: trackMock(spies.createMockInstance, true),
    clearAllMocks() {
      requireScopeAccess()
      mutateMocks(() => spies.clearAllMocks())
    },
    resetAllMocks() {
      requireScopeAccess()
      mutateMocks(() => spies.resetAllMocks())
    },
    restoreAllMocks() {
      requireScopeAccess()
      mutateMocks(() => spies.restoreAllMocks())
    },
  }

  function beginScope(
    context: AssertionAttempt | AssertionHook,
    kind: 'attempt' | 'hook'
  ) {
    if (disposed || active)
      throw new Error('An assertion attempt is already active or disposed')
    const promises: Promise<unknown>[] = []
    const records: { rejected: boolean; error?: unknown }[] = []
    const checks = new Map<() => void, (typeof records)[number]>()
    const onFinished: (() => void)[] = []
    // The pinned primitive registers each consumption check immediately after
    // its promise. Keep that association after settled promises remove themselves
    // from task.promises, without treating intentionally caught failures as errors.
    Object.defineProperty(onFinished, 'push', {
      value(...values: (() => void)[]) {
        for (const check of values) checks.set(check, records[checks.size])
        return Array.prototype.push.apply(this, values)
      },
    })
    // Track rejections without letting an unawaited assertion become a process
    // unhandled rejection while C is still executing the test body.
    Object.defineProperty(promises, 'push', {
      value(...values: Promise<unknown>[]) {
        for (const value of values) {
          const record: (typeof records)[number] = { rejected: false }
          records.push(record)
          void value.catch((error) => {
            record.rejected = true
            record.error = error
          })
        }
        return Array.prototype.push.apply(this, values)
      },
    })
    const task: AssertionTask = {
      type: kind === 'attempt' ? 'test' : 'suite',
      fullTestName: context.name,
      promises,
      onFinished,
    }
    const scope = {
      context,
      kind,
      task,
      finalized: false,
      mocks: new Set<{ mock: MockInstance; restore: boolean }>(),
    }
    active = scope
    if (kind === 'attempt' && 'testId' in context) {
      snapshotTests.delete(context.testId)
      snapshots.clearTest(options.testPath, context.testId)
    }
    setState(
      {
        assertionCalls: 0,
        expectedAssertionsNumber: null,
        expectedAssertionsNumberErrorGen: null,
        isExpectingAssertions: false,
        isExpectingAssertionsError: null,
        currentTestName: context.name,
        testPath: options.testPath,
      },
      expect
    )
    let checkedFinished = 0
    const checkedPromises = new Set<Promise<unknown>>()
    let checkedErrors = 0
    let checkedAssertions = false
    async function checkpoint() {
      if (scope.finalized) return
      const errors: unknown[] = []
      const uncheckedPromises = (task.promises ?? []).filter(
        (promise) => !checkedPromises.has(promise)
      )
      uncheckedPromises.forEach((promise) => checkedPromises.add(promise))
      const pending = await Promise.allSettled(uncheckedPromises)
      for (const result of pending) {
        if (result.status === 'rejected') errors.push(result.reason)
      }
      const newChecks = (task.onFinished ?? []).slice(checkedFinished)
      checkedFinished = task.onFinished?.length ?? 0
      for (const check of newChecks) {
        try {
          check()
        } catch (error) {
          const record = checks.get(check)
          if (record?.rejected && !errors.includes(record.error))
            errors.push(record.error)
          errors.push(error)
        }
      }
      errors.push(...(task.result?.errors ?? []).slice(checkedErrors))
      checkedErrors = task.result?.errors?.length ?? 0
      const state = getState(expect)
      if (
        !checkedAssertions &&
        state.expectedAssertionsNumber != null &&
        state.assertionCalls !== state.expectedAssertionsNumber
      ) {
        errors.push(state.expectedAssertionsNumberErrorGen!())
      }
      if (
        !checkedAssertions &&
        state.isExpectingAssertions &&
        state.assertionCalls === 0
      ) {
        errors.push(state.isExpectingAssertionsError)
      }
      checkedAssertions = true
      if (errors.length)
        throw new AggregateError(errors, 'Test assertions failed')
    }
    return {
      checkpoint,
      async finalize() {
        try {
          await checkpoint()
        } finally {
          scope.finalized = true
        }
      },
      async dispose() {
        if (active !== scope) return
        scope.finalized = true
        try {
          const errors = drainMocks(scope.mocks)
          if (errors.length)
            throw new AggregateError(errors, 'Test spy cleanup failed')
        } finally {
          active = undefined
        }
      },
    }
  }

  return {
    expect,
    spies: trackedSpies,
    beginAttempt: (context: AssertionAttempt) => beginScope(context, 'attempt'),
    beginHook: (context: AssertionHook) => beginScope(context, 'hook'),
    takeSnapshotUpdates() {
      if (!disposed)
        throw new Error('Finish assertions before taking snapshot updates.')
      const updates = stagedSnapshots.take()
      return snapshotTests.size ? updates : []
    },
    async finishFile() {
      if (active)
        throw new Error('Cannot finish assertions with an active attempt')
      if (disposed) return
      disposed = true
      const errors: unknown[] = []
      let result: Awaited<ReturnType<SnapshotClient['finish']>> | undefined
      try {
        // Preserve every unchecked entry, including undeclared, filtered, skipped,
        // cancelled, and removed assertions. Pruning requires a separate contract.
        const state = snapshots.getSnapshotState(options.testPath)
        if (snapshotOptions.updateSnapshot === 'all') {
          // The pinned primitive's pack() always calls this public method.
          // Override it on this file state only: even nonstandard legacy keys
          // must survive, and unchecked statistics must remain truthful.
          state.removeUncheckedKeys = () => {}
        }
        result = await snapshots.finish(options.testPath)
      } catch (error) {
        errors.push(error)
      }
      errors.push(...drainMocks(fileMocks))
      // Drain our own resources before global fallback helpers, which can stop
      // on a user-overridden mock method. Each fallback is attempted separately.
      try {
        mutateMocks(() => spies.restoreAllMocks())
      } catch (error) {
        errors.push(error)
      }
      try {
        mutateMocks(() => spies.clearAllMocks())
      } catch (error) {
        errors.push(error)
      }
      runtimeActive = false
      snapshots.clear()
      try {
        if (previousGlobalExpect)
          Object.defineProperty(globalThis, GLOBAL_EXPECT, previousGlobalExpect)
        else Reflect.deleteProperty(globalThis, GLOBAL_EXPECT)
      } catch (error) {
        errors.push(error)
      }
      if (errors.length)
        throw new AggregateError(errors, 'Test assertion file cleanup failed')
      return result
    },
  }
}
