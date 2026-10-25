/// <reference lib="es2021.promise" />
import { VitestSnapshotEnvironment } from './snapshot-environment'
import type {
  SnapshotHelperDispatch,
  DomainSnapshotAdapter,
} from './snapshot-helpers'
import {
  assertAssertionScope,
  beginAssertionFile,
  fileAssertionLifetime,
  getFileAssertionOrigin,
} from './assertion-platform'
import { createChaiEvents } from './chai-events'
import type { FileAutomockMaterializer } from '../mocking/fresh-module'
import type { Test } from '../runner/tasks'
import { MockPlugin } from './when'
import {
  resolveSnapshotUpdateMode,
  stageSnapshotUpdates,
  type SnapshotUpdateMode,
} from './snapshot-common'
import { createAttemptUtilities, type AttemptUtilities } from './utilities'
import { createTimerWaits } from './wait'
import {
  ASYMMETRIC_MATCHERS_OBJECT,
  GLOBAL_EXPECT,
  JEST_MATCHERS_OBJECT,
  chai,
  getChaiAssertionIdentity,
  getChaiAssertionTransferSourceIdentity,
  getVitestAssertionTaskRuntime,
  registerVitestAssertionTaskRuntime,
  createChaiAssertInterface,
  createChaiShouldInterface,
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
  type Assertion as PrimitiveAssertion,
  type AsymmetricMatchersContaining as PrimitiveAsymmetricMatchersContaining,
  type ExpectStatic,
  type MockInstance,
  type MaybeMockedDeep,
  mockObject as automockObject,
  spies,
  SnapshotClient,
  addSerializer,
  addCustomEqualityTesters,
  getCustomEqualityTesters,
  getSerializers,
  stripSnapshotIndentation,
  type SnapshotStateOptions,
} from '../../../compiled/next-test-primitives'

const realSetTimeout = globalThis.setTimeout.bind(globalThis)
const realDateNow = Date.now.bind(Date)
import { assertAssertionLifecycleScope } from './assertion-platform'

export type {
  Mock,
  MockInstance,
  Tester,
  TesterContext,
} from '../../../compiled/next-test-primitives'
export type {
  MatcherState,
  MatchersObject,
} from '../../../compiled/next-test-primitives'

/** C owns this identity and the active-context accessor. */
export interface AssertionAttempt {
  id: string
  testId: string
  name: string
  signal?: AbortSignal
  readonly task?: Test
  onAssertionFailure?(error: unknown): void
}

export interface AssertionCollection {
  id: string
  name: string
}

export interface AssertionHook {
  id: string
  name: string
  hook: 'beforeAll' | 'afterAll' | 'aroundAll' | 'cleanup'
}

// Declaration merging supplies user-defined matcher methods through the facade.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface Matchers<R = void, T = unknown> {
  toHaveBeenExhausted(): R
}

export interface Assertion<R extends void | Promise<void> = void, T = unknown>
  extends PrimitiveAssertion<R, T>,
    Matchers<R, T> {
  not: Assertion<R, T>
  resolves: Assertion<Promise<void>, T>
  rejects: Assertion<Promise<void>, T>
  toMatchSnapshot(propertiesOrMessage?: object | string, message?: string): R
  toMatchInlineSnapshot(
    propertiesOrSnapshot?: object | string,
    snapshotOrMessage?: string,
    message?: string
  ): R
  toMatchFileSnapshot(filepath: string, message?: string): Promise<void>
  toThrowErrorMatchingSnapshot(
    propertiesOrMessage?: object | string,
    message?: string
  ): R
  toThrowErrorMatchingInlineSnapshot(snapshot?: string, message?: string): R
}
export interface AsymmetricMatchersContaining
  extends PrimitiveAsymmetricMatchersContaining {}

export interface TestAssertion<T = unknown> extends Assertion<void, T> {
  toMatchSnapshot(propertiesOrMessage?: object | string, message?: string): void
  toMatchInlineSnapshot(
    propertiesOrSnapshot?: object | string,
    snapshotOrMessage?: string,
    message?: string
  ): void
  toMatchFileSnapshot(filepath: string, message?: string): Promise<void>
}

export interface TestExpect extends ExpectStatic, AsymmetricMatchersContaining {
  <T>(actual: T, message?: string): TestAssertion<T>
  soft<T>(actual: T, message?: string): TestAssertion<T>
  poll<T>(
    actual: (options: { signal: AbortSignal }) => T | Promise<T>,
    options?: { interval?: number; timeout?: number; message?: string }
  ): TestAssertion<Awaited<T>> & PromiseLike<void>
  assert: typeof chai.assert
  unreachable(message?: string): never
  addSnapshotSerializer(plugin: Parameters<typeof addSerializer>[0]): void
  addEqualityTesters(
    testers: Parameters<typeof addCustomEqualityTesters>[0]
  ): void
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

type TaskMatcherAssertion = {
  task: Test
  assertion: object
  assert(): void
  live(): boolean
  publish(value: object): object
}
// A custom matcher can outlive the file that installed its Chai method. Keep
// public receiver identity separate from the primitive's async bookkeeping.
const taskMatcherAssertions = new WeakMap<object, TaskMatcherAssertion>()
const taskMatcherReceivers = new WeakMap<object, TaskMatcherAssertion>()
const taskMatcherFlagOwners = new WeakMap<
  object,
  { task: Test; assert(): void }
>()
const taskMatcherMethods = new WeakSet<Function>()
const taskPrimitiveFlagDescriptor = Object.getOwnPropertyDescriptor(
  chai.util,
  'flag'
)
let taskPrimitiveDescriptors: Map<string, PropertyDescriptor | undefined>
let taskPrimitiveNotDescriptor: PropertyDescriptor | undefined
let taskPrimitiveThrowDelegateDescriptors:
  | Map<string, PropertyDescriptor | undefined>
  | undefined
let taskPrimitiveFluentDescriptors:
  | Map<string, PropertyDescriptor | undefined>
  | undefined
let taskPrimitiveFluentDelegateDescriptors:
  | Map<string, PropertyDescriptor | undefined>
  | undefined
let taskPrimitiveChainableDescriptors:
  | {
      container: PropertyDescriptor | undefined
      records: Map<
        string,
        {
          descriptor: PropertyDescriptor | undefined
          method: PropertyDescriptor | undefined
          chainingBehavior: PropertyDescriptor | undefined
        }
      >
    }
  | undefined
const scopedMatcherNames = new Set([
  'toMatchSnapshot',
  'toMatchInlineSnapshot',
  'toMatchFileSnapshot',
  'toThrowErrorMatchingSnapshot',
  'toThrowErrorMatchingInlineSnapshot',
])

function taskMatcherAssertion(value: unknown) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function'))
    return undefined
  const receiver = taskMatcherReceivers.get(value)
  if (receiver) return receiver
  const identity = getChaiAssertionIdentity(value)
  if (!identity) return undefined
  const direct = taskMatcherAssertions.get(identity)
  if (direct) return direct
  // Native Chai methods return their actual new assertion after copying flags.
  // Resolve its source Task without replacing that returned object or method.
  const visited = new Set<object>([identity])
  let source = getChaiAssertionTransferSourceIdentity(value)
  while (source && !visited.has(source)) {
    visited.add(source)
    const owner = taskMatcherAssertions.get(source)
    if (owner) {
      owner.publish(value)
      return taskMatcherReceivers.get(value)
    }
    source = getChaiAssertionTransferSourceIdentity(source)
  }
  return undefined
}

const chaiCallbackDispatches = new WeakMap<
  object,
  (
    callback: Function,
    receiver: unknown,
    args: unknown[],
    prototype: object,
    factory: boolean
  ) => unknown
>()
const chaiPluginDelegates = new WeakMap<
  Function,
  Parameters<typeof chai.use>[0]
>()
const chaiRegistrationCallbacks = new WeakMap<Function, Function>()
function wrapChaiRegistrationCallback(
  callback: Function,
  prototype: object,
  factory: boolean
): Function {
  const delegate = function (this: unknown, ...args: unknown[]) {
    // Resolve through the genuine runner at invocation, not through the runtime
    // that first installed a process-wide Chai plugin in a previous test file.
    const runtime = (
      require('../runner') as typeof import('../runner')
    ).getAssertionRuntime()
    const dispatch = chaiCallbackDispatches.get(runtime)
    if (!dispatch) throw new Error('Missing original Chai callback runtime')
    const result = dispatch(callback, this, args, prototype, factory)
    return factory && typeof result === 'function'
      ? wrapChaiRegistrationCallback(result, prototype, false)
      : result
  }
  chaiRegistrationCallbacks.set(delegate, callback)
  return delegate
}

let runtimeActive = false
let authorizedMockMutation = 0

/**
 * One instance per execution realm/file. No Vitest worker or runner is loaded.
 * C schedules attempts in the realm and owns all timeout/cancellation decisions.
 */
export async function createAssertionRuntime(options: {
  testPath: string
  collectOnly?: boolean
  observeNativeUnhandledAssertions?: boolean
  observePublicTaskQueues?: boolean
  observeNativeBeforeEachAssertions?: boolean
  observeNativeAfterEachAssertions?: boolean
  observeNativeBeforeEachCleanupAssertions?: boolean
  /** Actual bundle-local file run option, known after collection. */
  captureCoverageCompletion?: () => boolean
  resourceLifetime?: 'attempt' | 'file'
  fakeTimers?: import('./utilities').FakeTimerOptions
  runtimeConfig?: import('./utilities').RuntimeOptions
  waitForImports?: () => Promise<void>
  clearMocks?: boolean
  mockReset?: boolean
  restoreMocks?: boolean
  unstubGlobals?: boolean
  unstubEnvs?: boolean
  getCurrentAttempt: () => AssertionAttempt | undefined
  /** Actual logical current Test; omission preserves standalone internal callers. */
  getCurrentTest?: () => Test | undefined
  peekCurrentScope?: () =>
    | {
        kind:
          | 'attempt'
          | 'hook'
          | 'collection'
          | 'file-fixtures'
          | 'worker-fixtures'
        context: { id: string }
        closed: boolean
      }
    | undefined
  getCurrentCasePhase?: () =>
    | { attemptId: string; phase?: string; authoredCallback?: boolean }
    | undefined
  getCurrentHook?: () => AssertionHook | undefined
  getCurrentCollection?: () => AssertionCollection | undefined
  getCurrentFileFixtures?: () => AssertionCollection | undefined
  getCurrentScopeAncestors?: () => readonly string[]
  snapshotOptions?: SnapshotStateOptions
  updateSnapshots?: boolean
  snapshotUpdateMode?: SnapshotUpdateMode
  mapSnapshotLocation?: SnapshotStateOptions['snapshotEnvironment']['processStackTrace']
}) {
  if (runtimeActive)
    throw new Error('Only one assertion runtime may own a test realm')
  runtimeActive = true
  let closeAssertionFile: () => void
  try {
    closeAssertionFile = beginAssertionFile()
  } catch (error) {
    runtimeActive = false
    throw error
  }
  chai.use(JestExtend)
  chai.use(JestChaiExpect)
  chai.use(ChaiStyleAssertions)
  chai.use(JestAsymmetricMatchers)
  chai.use(MockPlugin)

  const snapshots = new SnapshotClient({
    isEqual: (received, expected) =>
      equals(received, expected, [iterableEquality, subsetEquality]),
  })
  const snapshotOptions = options.snapshotOptions ?? {
    updateSnapshot: resolveSnapshotUpdateMode(options),
    snapshotEnvironment: new VitestSnapshotEnvironment(),
  }
  const stagedSnapshots = stageSnapshotUpdates(
    snapshotOptions.snapshotEnvironment,
    snapshotOptions.updateSnapshot !== 'none'
  )
  try {
    if (options.mapSnapshotLocation) {
      stagedSnapshots.environment.processStackTrace =
        options.mapSnapshotLocation
    }
    if (!options.collectOnly)
      await snapshots.setup(options.testPath, {
        ...snapshotOptions,
        snapshotEnvironment: stagedSnapshots.environment,
      })
  } catch (error) {
    closeAssertionFile()
    runtimeActive = false
    throw error
  }

  type AsyncAssertionRecord = {
    promise: Promise<unknown>
    rejected: boolean
    body: boolean
    beforeEach: boolean
    afterEach: boolean
    beforeEachCleanup: boolean
    publicQueue?: boolean
    publicFinished?: { promise: Promise<unknown>; check: () => void }
    error?: unknown
    consumptionFailure?: unknown
    bodyFailure?: unknown
    bodyFailureConsumed?: boolean
    settledBeforeFinalization?: boolean
    nativeUnhandled?: { reason: unknown }
  }
  type AsyncAssertionObserver = NonNullable<
    Parameters<typeof registerVitestAssertionTaskRuntime>[2]
  >
  type AssertionScope = {
    context: AssertionAttempt | AssertionHook | AssertionCollection
    kind: 'attempt' | 'hook' | 'collection' | 'file-fixtures'
    ancestors: readonly string[]
    task: AssertionTask
    finalized: boolean
    disposed: boolean
    asyncAssertions: AsyncAssertionRecord[]
    asyncAssertionObserver?: AsyncAssertionObserver
    assertionCounts: { expect: TestExpect; error: Error; body: boolean }[]
    mocks: Set<{ mock: MockInstance; restore: boolean }>
    serializers: Set<Parameters<typeof addSerializer>[0]>
    utilities: AttemptUtilities
  }
  const coverageAfterAllRecords: {
    scope: AssertionScope
    promise: object
    settled: boolean
    hostSettlement?: true
    observed?: { reason: unknown }
  }[] = []
  let coverageAfterAllMetadataInvalid = false
  const scopes = new Map<string, AssertionScope>()
  let nativeRejectionRecordsReleased = false
  let runningAttempt: AssertionScope | undefined
  let lastAttemptName: string | undefined
  function runningAttemptTask() {
    return runningAttempt?.task
  }
  function liveFileFixtureAttempt() {
    return runningAttempt &&
      !runningAttempt.finalized &&
      scopes.get(runningAttempt.context.id) === runningAttempt
      ? runningAttempt
      : undefined
  }
  function originatingScope(strict = false) {
    if (fileAssertionLifetime && !strict) {
      const origin = getFileAssertionOrigin()
      return origin ? scopes.get(origin.id) : undefined
    }
    // Read all origin accessors so C still attributes closed asynchronous work
    // to its original owner, even after this runtime or another scope finishes.
    const attempt = options.getCurrentAttempt()
    const hook = options.getCurrentHook?.()
    const collection = options.getCurrentCollection?.()
    const fileFixtures = options.getCurrentFileFixtures?.()
    const origin = attempt ?? hook ?? collection ?? fileFixtures
    return origin ? scopes.get(origin.id) : undefined
  }
  const snapshotTests = new Set<string>()
  const suspendedScopes = new Set<AssertionScope>()
  let snapshotSelection: { partial: boolean; complete: boolean } | undefined
  let snapshotResult: Awaited<ReturnType<SnapshotClient['finish']>> | undefined
  let disposed = false
  function current() {
    // Consult origin accessors even after disposal: C records late work here,
    // including when user code retained a direct assertion/spy function.
    const active = originatingScope()
    if (disposed || !active || (active.finalized && !fileAssertionLifetime)) {
      throw new Error(
        'expect() requires an active Next test attempt or suite hook'
      )
    }
    return active
  }

  function requireScopeAccess() {
    if (scopes.size) {
      if (!fileAssertionLifetime) current()
      else {
        const active = originatingScope(true)
        if (disposed || !active || active.finalized)
          throw new Error(
            'expect() requires an active Next test attempt or suite hook'
          )
      }
    } else {
      const originatingAttempt = options.getCurrentAttempt()
      const originatingHook = options.getCurrentHook?.()
      if (
        disposed ||
        originatingAttempt ||
        originatingHook ||
        options.getCurrentCollection?.() ||
        options.getCurrentFileFixtures?.()
      ) {
        throw new Error('Cannot access a disposed assertion scope')
      }
    }
  }

  function requireAssertionAccess() {
    if (!fileAssertionLifetime) return requireScopeAccess()
    if (disposed) throw new Error('Cannot access a disposed assertion scope')
    if (scopes.size) current()
  }

  let fileTimerClock:
    | { isFakeTimers(): boolean; advanceTimersByTime(ms: number): void }
    | undefined
  let realTimerWaits: ReturnType<typeof createTimerWaits> | undefined
  function getRealTimerWaits() {
    requireScopeAccess()
    return (realTimerWaits ??= createTimerWaits(
      {
        isFakeTimers: () => fileTimerClock?.isFakeTimers() ?? false,
        advanceTimersByTime: (ms) => fileTimerClock?.advanceTimersByTime(ms),
      },
      () => {
        if (disposed)
          throw new Error('Cannot access a disposed assertion scope')
      },
      { rejectOnDispose: false }
    ))
  }

  const runtimeConfig = options.runtimeConfig ?? {
    fakeTimers: {
      loopLimit: 10000,
      shouldClearNativeTimers: true,
      ...options.fakeTimers,
    },
    clearMocks: options.clearMocks,
    mockReset: options.mockReset,
    restoreMocks: options.restoreMocks,
  }
  const equalityTesters: Parameters<typeof addCustomEqualityTesters>[0] = []
  const fileOwned = options.resourceLifetime === 'file'
  const publicTestState = !!options.getCurrentTest && !fileAssertionLifetime
  const fileUtilities = fileOwned
    ? createAttemptUtilities(
        requireScopeAccess,
        options.fakeTimers,
        runtimeConfig,
        options.waitForImports,
        (clock) => {
          fileTimerClock = clock
        }
      )
    : undefined

  const collectionUtilities =
    fileUtilities ??
    createAttemptUtilities(
      requireScopeAccess,
      options.fakeTimers,
      runtimeConfig,
      options.waitForImports
    )

  // Chai and the async matcher extension keep separate primitive maps. A real
  // proxify result retains the exact identity of its already known input.
  const proxifiedAssertionIdentities = new WeakMap<object, object>()
  function chaiAssertionIdentity(value: unknown) {
    return (
      getChaiAssertionIdentity(value) ??
      (value && (typeof value === 'object' || typeof value === 'function')
        ? proxifiedAssertionIdentities.get(value)
        : undefined)
    )
  }
  const assertionOrigins = new WeakMap<object, AssertionScope>()
  const legacyAssertionRecords = new WeakMap<
    object,
    { raw: object; scope: AssertionScope }
  >()
  function recordAssertionOrigin(assertion: object, scope: AssertionScope) {
    const identity = chaiAssertionIdentity(assertion)
    if (!identity) throw new Error('Unrecognized Chai assertion origin')
    const previous = assertionOrigins.get(identity)
    if (previous && previous !== scope) assertStrictScope(previous)
    else assertionOrigins.set(identity, scope)
  }
  function isBodyAssertion(scope: AssertionScope) {
    const origin = options.getCurrentCasePhase?.()
    return (
      scope.kind === 'attempt' &&
      origin?.attemptId === scope.context.id &&
      origin.phase === 'test'
    )
  }

  function isAuthoredHookAssertion(
    scope: AssertionScope,
    phase: 'beforeEach' | 'afterEach' | 'cleanup'
  ) {
    const origin = options.getCurrentCasePhase?.()
    return (
      scope.kind === 'attempt' &&
      origin?.attemptId === scope.context.id &&
      origin.phase === phase &&
      origin.authoredCallback === true
    )
  }

  function guardAssertion(assertion: object, scope: AssertionScope) {
    recordAssertionOrigin(assertion, scope)
    const proxies = new WeakMap<object, object>()
    function check() {
      assertAssertionScope()
      if (
        fileAssertionLifetime
          ? disposed || scopes.get(scope.context.id) !== scope
          : current() !== scope
      ) {
        throw new Error(
          'Assertion was created in a different Next assertion scope'
        )
      }
    }
    function wrapProducedAssertion(value: object): object {
      recordAssertionOrigin(value, scope)
      return wrap(value)
    }
    function wrap(
      value: object,
      receiver?: object,
      inlineSnapshot = false
    ): object {
      const cached = proxies.get(value)
      if (cached) return cached
      const handler: ProxyHandler<object> = {
        get(target, property) {
          // Native Promise adoption reads then after a callback's scope exits.
          // A known live Browser assertion without that protocol stays the
          // same nonthenable payload; present properties keep their guards.
          if (
            property === 'then' &&
            fileAssertionLifetime &&
            typeof target === 'object' &&
            !disposed &&
            scopes.get(scope.context.id) === scope &&
            chaiAssertionIdentity(target) &&
            !Reflect.has(target, property)
          )
            return undefined
          check()
          const result = Reflect.get(target, property, target)
          if (typeof result === 'function') {
            const registered = (
              globalThis as typeof globalThis & {
                [JEST_MATCHERS_OBJECT]?: { matchers: object }
              }
            )[JEST_MATCHERS_OBJECT]?.matchers
            return wrap(
              result,
              target,
              property === 'toMatchInlineSnapshot' ||
                property === 'toThrowErrorMatchingInlineSnapshot' ||
                !!(registered && Object.hasOwn(registered, property))
            )
          }
          if (result instanceof chai.Assertion)
            return wrapProducedAssertion(result)
          return result
        },
        construct(target, args, newTarget) {
          check()
          const result = Reflect.construct(target as Function, args, newTarget)
          return result instanceof chai.Assertion
            ? wrapProducedAssertion(result)
            : result
        },
        // The pinned snapshot primitive recognizes this marker and uses the
        // next frame. Capture at invocation, before Chai adds wrappers or an
        // asynchronous resolves/rejects continuation loses the caller.
        apply: {
          __INLINE_SNAPSHOT_OFFSET_1__(
            target: object,
            thisArg: unknown,
            args: unknown[]
          ) {
            check()
            if (inlineSnapshot) {
              chai.util.flag(
                assertion,
                'next-test-inline-callsite',
                new Error()
              )
            }
            const origin = options.peekCurrentScope?.()
            const coverageOrigin =
              options.captureCoverageCompletion?.() === true &&
              origin?.kind === 'hook' &&
              !origin.closed &&
              origin.context === scope.context &&
              scope.kind === 'hook' &&
              'hook' in scope.context &&
              scope.context.hook === 'afterAll' &&
              !disposed &&
              !scope.finalized &&
              !scope.disposed
                ? scope
                : undefined
            const result = Reflect.apply(
              target as (...args: unknown[]) => unknown,
              receiver ?? thisArg,
              args
            )
            // No Task is published for ordinary afterAll. Retain only the exact
            // returned object; the existing native rejection event must prove
            // it is the actual rejected promise. Never probe or consume it.
            if (
              coverageOrigin &&
              result !== null &&
              typeof result === 'object'
            ) {
              const recorded = coverageAfterAllRecords.find(
                (record) =>
                  record.promise === result && record.scope === coverageOrigin
              )
              if (!recorded)
                coverageAfterAllRecords.push({
                  scope: coverageOrigin,
                  promise: result,
                  settled: false,
                  hostSettlement: true,
                })
            }
            // Promise results retain the primitive's own consumption tracking.
            return result instanceof chai.Assertion
              ? wrapProducedAssertion(result)
              : result
          },
        }.__INLINE_SNAPSHOT_OFFSET_1__,
      }
      // A literal method name survives minification in Gecko stacks, which
      // ignore a later function.name update. Keep that name for other engines
      // as well: it is the snapshot primitive's stack-offset protocol.
      Object.defineProperty(handler.apply, 'name', {
        value: '__INLINE_SNAPSHOT_OFFSET_1__',
        configurable: true,
      })
      const proxy = new Proxy(value, handler)
      proxies.set(value, proxy)
      if (
        chaiAssertionIdentity(value) &&
        assertionOrigins.get(chaiAssertionIdentity(value)!) === scope
      )
        legacyAssertionRecords.set(proxy, { raw: value, scope })
      return proxy
    }
    return wrap(assertion)
  }

  // Chai's public raw construction does not increment Vitest's wrapped expect
  // counter or attach its task flag. Admission still belongs to this exact
  // original Next scope; a retained assertion cannot borrow a later owner.
  function createChaiAssertion<T>(
    actual: T,
    message?: string
  ): TestAssertion<T> {
    assertAssertionScope()
    const scope = current()
    return guardAssertion(
      chai.expect(actual, message),
      scope
    ) as TestAssertion<T>
  }

  const chaiUserResults = new WeakSet<object>()
  const defaultChaiPrototype = Object.create(null) as object
  const strictAssertionRecords = new WeakMap<
    object,
    {
      raw: object
      scope: AssertionScope
      proxy: object
      prototype: object
    }
  >()
  const strictRawRecords = new WeakMap<
    object,
    {
      raw: object
      scope: AssertionScope
      proxy: object
      prototype: object
    }
  >()
  function assertStrictScope(scope: AssertionScope) {
    assertAssertionScope()
    if (
      fileAssertionLifetime
        ? disposed || scopes.get(scope.context.id) !== scope
        : current() !== scope
    ) {
      throw new Error(
        'Assertion was created in a different Next assertion scope'
      )
    }
  }
  function strictUnwrap(value: unknown) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function'))
      return value
    const record =
      strictAssertionRecords.get(value) ?? legacyAssertionRecords.get(value)
    if (!record) return value
    assertStrictScope(record.scope)
    return record.raw
  }
  function strictResult(
    value: unknown,
    scope: AssertionScope,
    prototype: object
  ): unknown {
    if (
      value &&
      (typeof value === 'object' || typeof value === 'function') &&
      chaiUserResults.has(value)
    )
      return value
    return chaiAssertionIdentity(value)
      ? guardStrictChaiAssertion(value as object, scope, prototype)
      : value
  }
  const strictFunctionRecords = new WeakMap<
    Function,
    {
      raw: Function
      scope: AssertionScope
      prototype: object
      receiver?: object
      collectionPrototype: boolean
    }
  >()
  function strictFunction(
    fn: Function,
    scope: AssertionScope,
    prototype: object,
    receiver?: object,
    collectionPrototype = false
  ): (...args: unknown[]) => unknown {
    // Collection plugins retain prototype methods, rather than assertions.
    // Resolve their actual invocation owner without lending that permission to
    // functions captured from an assertion, case or suite hook.
    function invocationScope() {
      return collectionPrototype ? current() : scope
    }
    const invoke = function (this: unknown, ...args: unknown[]) {
      const owner = invocationScope()
      assertStrictScope(owner)
      let actualReceiver = receiver
      if (actualReceiver === undefined) {
        const record =
          this && (typeof this === 'object' || typeof this === 'function')
            ? (strictAssertionRecords.get(this) ??
              legacyAssertionRecords.get(this))
            : undefined
        if (!record)
          throw new Error(
            'Chai prototype methods require an admitted assertion receiver'
          )
        assertStrictScope(record.scope)
        actualReceiver = record.raw
      }
      return strictResult(
        Reflect.apply(fn, actualReceiver, args),
        owner,
        prototype
      )
    }
    const proxy = new Proxy(invoke, {
      get(target, key, proxyReceiver) {
        const owner = invocationScope()
        assertStrictScope(owner)
        if (key === '__flags')
          throw new Error('Raw Chai assertion flags are not exposed')
        if (
          key === 'prototype' ||
          key === 'constructor' ||
          key === 'call' ||
          key === 'apply' ||
          key === 'bind'
        )
          return Reflect.get(target, key, proxyReceiver)
        const value = Reflect.get(fn, key, fn)
        if (
          key === '_obj' ||
          (value &&
            (typeof value === 'object' || typeof value === 'function') &&
            chaiUserResults.has(value))
        )
          return value
        if (typeof value === 'function')
          return strictFunction(value, owner, prototype, fn)
        return strictResult(value, owner, prototype)
      },
      construct(_target, args) {
        const owner = invocationScope()
        assertStrictScope(owner)
        return guardStrictChaiAssertion(
          Reflect.construct(fn, args),
          owner,
          prototype
        )
      },
      getOwnPropertyDescriptor() {
        assertStrictScope(invocationScope())
        throw new Error(
          'This Chai assertion reflection API is not yet supported'
        )
      },
    })
    strictFunctionRecords.set(proxy, {
      raw: fn,
      scope,
      prototype,
      receiver,
      collectionPrototype,
    })
    return proxy
  }
  function guardStrictChaiAssertion(
    raw: object,
    scope: AssertionScope,
    prototype: object
  ): object {
    recordAssertionOrigin(raw, scope)
    const prior = strictRawRecords.get(raw)
    if (prior) {
      assertStrictScope(prior.scope)
      return prior.proxy
    }
    const methods = new Map<
      PropertyKey,
      { value: Function; method: Function }
    >()
    const Constructor = function (...args: unknown[]) {
      assertStrictScope(scope)
      return guardStrictChaiAssertion(
        Reflect.construct(chai.Assertion, args),
        scope,
        prototype
      )
    }
    Object.defineProperty(Constructor, 'prototype', { value: prototype })
    Object.defineProperty(Constructor, Symbol.hasInstance, {
      value(value: unknown) {
        assertStrictScope(scope)
        return (
          !!value &&
          (typeof value === 'object' || typeof value === 'function') &&
          strictAssertionRecords.has(value)
        )
      },
    })
    const proxy = new Proxy(Object.create(null), {
      get(_target, key) {
        assertStrictScope(scope)
        if (key === '__flags')
          throw new Error('Raw Chai assertion flags are not exposed')
        if (key === 'constructor') return Constructor
        const value = Reflect.get(raw, key, raw)
        // _obj is the caller's original assertion subject, not an API capability.
        if (
          key === '_obj' ||
          (value &&
            (typeof value === 'object' || typeof value === 'function') &&
            chaiUserResults.has(value))
        )
          return value
        if (typeof value === 'function') {
          let cached = methods.get(key)
          if (!cached || cached.value !== value) {
            cached = {
              value,
              method: strictFunction(value, scope, prototype, raw),
            }
            methods.set(key, cached)
          }
          return cached.method
        }
        return strictResult(value, scope, prototype)
      },
      getPrototypeOf() {
        assertStrictScope(scope)
        return prototype
      },
      getOwnPropertyDescriptor() {
        assertStrictScope(scope)
        throw new Error(
          'This Chai assertion reflection API is not yet supported'
        )
      },
      defineProperty() {
        assertStrictScope(scope)
        throw new Error('Direct Chai assertion mutation is not yet supported')
      },
      set() {
        assertStrictScope(scope)
        throw new Error('Direct Chai assertion mutation is not yet supported')
      },
    })
    const record = { raw, scope, proxy, prototype }
    strictAssertionRecords.set(proxy, record)
    strictRawRecords.set(raw, record)
    return proxy
  }
  function assertChaiNamespaceAccess() {
    requireAssertionAccess()
    assertAssertionScope()
  }
  let eventBridge: ReturnType<typeof createChaiEvents> | undefined
  function chaiEvents() {
    assertChaiNamespaceAccess()
    eventBridge ??= createChaiEvents(
      Reflect.get(chai.util, 'events') as EventTarget,
      assertChaiNamespaceAccess,
      (callback) =>
        typeof callback === 'function'
          ? (chaiRegistrationCallbacks.get(callback) ?? callback)
          : callback
    )
    return eventBridge.target
  }

  function createChaiNamespaceAssertion(args: unknown[], prototype: object) {
    assertChaiNamespaceAccess()
    const subject = args[0]
    if (
      subject &&
      (typeof subject === 'object' || typeof subject === 'function')
    )
      chaiUserResults.add(subject)
    return guardStrictChaiAssertion(
      Reflect.apply(chai.expect, undefined, args),
      current(),
      prototype
    )
  }
  function constructChaiNamespaceAssertion(args: unknown[], prototype: object) {
    assertChaiNamespaceAccess()
    const subject = args[0]
    if (
      subject &&
      (typeof subject === 'object' || typeof subject === 'function')
    )
      chaiUserResults.add(subject)
    return guardStrictChaiAssertion(
      Reflect.construct(chai.Assertion, args),
      current(),
      prototype
    )
  }
  function callChaiPluginCallback(
    callback: Function,
    receiver: unknown,
    args: unknown[],
    prototype: object,
    factory: boolean
  ) {
    assertChaiNamespaceAccess()
    const scope = current()
    const originalScope =
      receiver &&
      (typeof receiver === 'object' || typeof receiver === 'function')
        ? assertionOrigins.get(chaiAssertionIdentity(receiver)!)
        : undefined
    if (originalScope) assertStrictScope(originalScope)
    else if (!factory || receiver != null)
      throw new Error('Unrecognized Chai plugin assertion receiver')
    const guardedReceiver = originalScope
      ? guardStrictChaiAssertion(receiver as object, originalScope, prototype)
      : receiver
    const values = factory
      ? args.map((value) =>
          typeof value === 'function'
            ? strictFunction(value, scope, prototype)
            : value
        )
      : args
    const result = Reflect.apply(callback, guardedReceiver, values)
    // Returning a caller value is not permission to inspect its prototype (a
    // revoked Proxy is a valid payload). Only our own assertion proxies unwrap.
    if (
      result &&
      (typeof result === 'object' || typeof result === 'function') &&
      !strictAssertionRecords.has(result)
    )
      chaiUserResults.add(result)
    return strictUnwrap(result)
  }
  const chaiPrototypeCallables = new WeakMap<
    AssertionScope,
    WeakMap<object, WeakMap<Function, (...args: unknown[]) => unknown>>
  >()
  function readChaiPrototypeCallable(value: Function, prototype: object) {
    const scope = current()
    let prototypes = chaiPrototypeCallables.get(scope)
    if (!prototypes) {
      prototypes = new WeakMap()
      chaiPrototypeCallables.set(scope, prototypes)
    }
    let functions = prototypes.get(prototype)
    if (!functions) {
      functions = new WeakMap()
      prototypes.set(prototype, functions)
    }
    let method = functions.get(value)
    if (!method) {
      method = strictFunction(
        value,
        scope,
        prototype,
        undefined,
        scope.kind === 'collection'
      )
      functions.set(value, method)
    }
    return method
  }
  function readChaiPrototypeDescriptor(key: PropertyKey, prototype: object) {
    assertChaiNamespaceAccess()
    const descriptor = Reflect.getOwnPropertyDescriptor(
      chai.Assertion.prototype,
      key
    )
    if (!descriptor) return undefined
    if (!descriptor.configurable)
      throw new Error(
        'Nonconfigurable Chai prototype descriptors are not yet supported'
      )
    if ('value' in descriptor) {
      if (typeof descriptor.value !== 'function')
        throw new Error(
          'This Chai prototype descriptor value is not yet supported'
        )
      return {
        ...descriptor,
        value: readChaiPrototypeCallable(descriptor.value, prototype),
      }
    }
    return {
      ...descriptor,
      get: descriptor.get
        ? readChaiPrototypeCallable(descriptor.get, prototype)
        : undefined,
      set: descriptor.set
        ? readChaiPrototypeCallable(descriptor.set, prototype)
        : undefined,
    }
  }
  function readChaiPrototype(key: PropertyKey, prototype: object): unknown {
    assertChaiNamespaceAccess()
    const descriptor = Reflect.getOwnPropertyDescriptor(
      chai.Assertion.prototype,
      key
    )
    if (descriptor && !('value' in descriptor))
      throw new Error('Chai prototype accessors are not yet supported')
    const value = descriptor?.value
    if (typeof value === 'function')
      return readChaiPrototypeCallable(value, prototype)
    if (value === undefined || value === null || typeof value !== 'object')
      return value
    throw new Error('This Chai prototype value is not yet supported')
  }
  function registerChaiAssertionMember(
    key: string,
    args: unknown[],
    prototype: object
  ) {
    assertChaiNamespaceAccess()
    if (
      ![
        'addMethod',
        'addProperty',
        'addChainableMethod',
        'overwriteMethod',
        'overwriteProperty',
        'overwriteChainableMethod',
      ].includes(key)
    )
      throw new Error('Unsupported Chai registration utility')
    const fn = Reflect.get(chai.util, key)
    const values = args.map((value, index) =>
      index > 0 && typeof value === 'function'
        ? wrapChaiRegistrationCallback(
            value,
            prototype,
            key.startsWith('overwrite')
          )
        : value
    )
    return Reflect.apply(fn, chai.util, [chai.Assertion.prototype, ...values])
  }
  function callChaiUtility(key: string, args: unknown[], prototype: object) {
    if (key === 'transferFlags') {
      // Flag copying is the actual pure Chai operation, including partial
      // assignments on a later throw. Unwrap only our own public views.
      const values = args.map((value, index) =>
        index < 2 &&
        value &&
        (typeof value === 'object' || typeof value === 'function')
          ? (taskAssertionRecords.get(value)?.raw ??
            strictAssertionRecords.get(value)?.raw ??
            legacyAssertionRecords.get(value)?.raw ??
            value)
          : value
      )
      return Reflect.apply(chai.util.transferFlags, chai.util, values)
    }
    assertChaiNamespaceAccess()
    const fn = Reflect.get(chai.util, key)
    if (key === 'proxify' && typeof fn === 'function') {
      const input = args[0]
      const assertion =
        input && (typeof input === 'object' || typeof input === 'function')
          ? (strictAssertionRecords.get(input) ??
            legacyAssertionRecords.get(input))
          : undefined
      if (assertion) {
        assertStrictScope(assertion.scope)
        const result = Reflect.apply(fn, chai.util, [
          assertion.raw,
          ...args.slice(1),
        ])
        if (result === assertion.raw) return input
        const identity = chaiAssertionIdentity(assertion.raw)
        if (identity)
          proxifiedAssertionIdentities.set(result as object, identity)
        return guardStrictChaiAssertion(
          result as object,
          assertion.scope,
          strictAssertionRecords.get(input as object)?.prototype ?? prototype
        )
      }
      const method =
        typeof input === 'function'
          ? strictFunctionRecords.get(input)
          : undefined
      if (method) {
        assertStrictScope(method.collectionPrototype ? current() : method.scope)
        const result = Reflect.apply(fn, chai.util, [
          method.raw,
          ...args.slice(1),
        ])
        return result === method.raw
          ? input
          : strictFunction(
              result as Function,
              method.scope,
              method.prototype,
              method.receiver,
              method.collectionPrototype
            )
      }
      // Ordinary payloads use Chai's exact proxy and property behavior.
      return Reflect.apply(fn, chai.util, args)
    }
    if (
      typeof fn !== 'function' ||
      ![
        'addLengthGuard',
        'compareByInspect',
        'eql',
        'expectTypes',
        'flag',
        'getActual',
        'getMessage',
        'getName',
        'getOperator',
        'getOwnEnumerableProperties',
        'getOwnEnumerablePropertySymbols',
        'getPathInfo',
        'hasProperty',
        'inspect',
        'isNaN',
        'isNumeric',
        'isProxyEnabled',
        'isRegExp',
        'objDisplay',
        'test',
        'transferFlags',
        'type',
      ].includes(key)
    )
      throw new Error('This Chai utility is not yet supported')
    if (key === 'flag') {
      const descriptor = Object.getOwnPropertyDescriptor(chai.util, key)
      const intrinsic =
        taskPrimitiveFlagDescriptor &&
        descriptor &&
        ('value' in taskPrimitiveFlagDescriptor
          ? 'value' in descriptor &&
            descriptor.value === taskPrimitiveFlagDescriptor.value
          : !('value' in descriptor) &&
            descriptor.get === taskPrimitiveFlagDescriptor.get &&
            descriptor.set === taskPrimitiveFlagDescriptor.set)
      const input = args[0]
      const taskAssertion =
        intrinsic &&
        input &&
        (typeof input === 'object' || typeof input === 'function')
          ? taskAssertionRecords.get(input)
          : undefined
      const value = Reflect.apply(fn, chai.util, [
        taskAssertion?.raw ?? strictUnwrap(input),
        ...args.slice(1),
      ])
      if (
        args.length === 2 &&
        args[1] === 'ssfi' &&
        typeof value === 'function'
      )
        return strictFunction(value, current(), prototype)
      return value
    }
    const values = [
      'expectTypes',
      'getActual',
      'getMessage',
      'getOperator',
      'test',
    ].includes(key)
      ? [strictUnwrap(args[0]), ...args.slice(1)]
      : args
    // These selected utilities return user data/primitives, not new owned
    // assertions. In particular getActual must not probe a Proxy subject.
    return Reflect.apply(fn, chai.util, values)
  }

  // Only the unchanged primitive members are pure Task-owned hard paths.
  // Descriptor reads do not execute a later authored getter or override.
  const taskAssertionPrototype = chai.Assertion.prototype
  const taskChainableReceivers = new WeakMap<
    object,
    { prototype: object; source: object }
  >()
  function taskNativeReceiverNodes(assertion: object): object[] | undefined {
    const nodes: object[] = []
    const identities = new Set<object>()
    let receiverNode = assertion
    for (;;) {
      const prototype = Object.getPrototypeOf(receiverNode)
      if (
        typeof receiverNode !== 'function' &&
        prototype === taskAssertionPrototype
      )
        return [...nodes, receiverNode]
      const identity = chaiAssertionIdentity(receiverNode)
      if (!identity || identities.has(identity)) return undefined
      identities.add(identity)
      const chainable = taskChainableReceivers.get(identity)
      if (
        !chainable ||
        prototype !== chainable.prototype ||
        Object.getPrototypeOf(prototype) !== chainable.source
      )
        return undefined
      nodes.push(receiverNode, prototype)
      receiverNode = chainable.source
    }
  }
  function rememberTaskChainableReceiver(value: object, source: object) {
    const identity = chaiAssertionIdentity(value)
    const sourceIdentity = chaiAssertionIdentity(source)
    if (!sourceIdentity || !taskNativeReceiverNodes(source)) return
    const prototype = Object.getPrototypeOf(value)
    const rawSource = prototype && Object.getPrototypeOf(prototype)
    if (
      typeof value === 'function' &&
      identity &&
      rawSource &&
      chaiAssertionIdentity(rawSource) === sourceIdentity &&
      taskNativeReceiverNodes(rawSource)
    )
      taskChainableReceivers.set(identity, { prototype, source: rawSource })
  }
  const taskHardDescriptors = (taskPrimitiveDescriptors ??= new Map(
    [
      'toBe',
      'toEqual',
      'toStrictEqual',
      'toMatchObject',
      'toHaveProperty',
      'toBeTypeOf',
      'toBeDefined',
      'toBeUndefined',
      'toBeNull',
      'toBeNaN',
      'toBeTruthy',
      'toBeFalsy',
      'toBeGreaterThan',
      'toBeGreaterThanOrEqual',
      'toBeLessThan',
      'toBeLessThanOrEqual',
      'toBeCloseTo',
      'toBeInstanceOf',
      'toContain',
      'toContainEqual',
      'toHaveLength',
      'toMatch',
      'toThrow',
      'toThrowError',
    ].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(taskAssertionPrototype, name),
    ])
  ))
  const taskNotDescriptor = (taskPrimitiveNotDescriptor ??=
    Object.getOwnPropertyDescriptor(taskAssertionPrototype, 'not'))
  const taskThrowDelegateDescriptors =
    (taskPrimitiveThrowDelegateDescriptors ??= new Map(
      ['throws', 'assert'].map((name) => [
        name,
        Object.getOwnPropertyDescriptor(taskAssertionPrototype, name),
      ])
    ))
  const taskThrowCallables = new WeakSet<Function>()
  function taskThrowMember(key: PropertyKey) {
    return key === 'toThrow' || key === 'toThrowError'
  }
  function unchangedTaskThrowDelegates(assertion: object) {
    const nodes = taskNativeReceiverNodes(assertion)
    if (!nodes) return false
    for (const [key, original] of taskThrowDelegateDescriptors) {
      if (nodes.some((node) => Object.hasOwn(node, key))) return false
      const descriptor = Object.getOwnPropertyDescriptor(
        taskAssertionPrototype,
        key
      )
      if (
        !original ||
        !descriptor ||
        !('value' in original) ||
        !('value' in descriptor) ||
        typeof original.value !== 'function' ||
        descriptor.value !== original.value
      )
        return false
    }
    return true
  }
  function pureTaskMember(assertion: object, key: PropertyKey) {
    const nodes = taskNativeReceiverNodes(assertion)
    if (!nodes || nodes.some((node) => Object.hasOwn(node, key))) return false
    const original =
      key === 'not' ? taskNotDescriptor : taskHardDescriptors.get(String(key))
    const descriptor = Object.getOwnPropertyDescriptor(
      taskAssertionPrototype,
      key
    )
    if (!original || !descriptor) return false
    if (taskThrowMember(key) && !unchangedTaskThrowDelegates(assertion))
      return false
    return key === 'not'
      ? !('value' in descriptor) &&
          descriptor.get === original.get &&
          descriptor.set === original.set
      : 'value' in descriptor &&
          typeof original.value === 'function' &&
          descriptor.value === original.value
  }

  const taskFluentDescriptors = (taskPrimitiveFluentDescriptors ??= new Map(
    [
      'to',
      'be',
      'have',
      'deep',
      'equal',
      'property',
      'lengthOf',
      'instanceOf',
      'include',
      'match',
      'ok',
      'true',
      'a',
      'keys',
      'above',
    ].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(taskAssertionPrototype, name),
    ])
  ))
  const taskFluentDelegateDescriptors =
    (taskPrimitiveFluentDelegateDescriptors ??= new Map(
      ['assert', 'eql', '_obj', 'to', 'have', 'property'].map((name) => [
        name,
        Object.getOwnPropertyDescriptor(taskAssertionPrototype, name),
      ])
    ))
  const taskChainableDescriptors = (taskPrimitiveChainableDescriptors ??=
    (() => {
      const container = Object.getOwnPropertyDescriptor(
        taskAssertionPrototype,
        '__methods'
      )
      const methods = container && 'value' in container && container.value
      return {
        container,
        records: new Map(
          ['lengthOf', 'include', 'a'].map((name) => {
            const descriptor =
              methods && Object.getOwnPropertyDescriptor(methods, name)
            const record =
              descriptor && 'value' in descriptor && descriptor.value
            return [
              name,
              {
                descriptor,
                method:
                  record && Object.getOwnPropertyDescriptor(record, 'method'),
                chainingBehavior:
                  record &&
                  Object.getOwnPropertyDescriptor(record, 'chainingBehavior'),
              },
            ]
          })
        ),
      }
    })())
  const taskFluentCallables = new WeakMap<Function, string>()
  function sameTaskFluentDescriptor(
    original: PropertyDescriptor | undefined,
    descriptor: PropertyDescriptor | undefined
  ) {
    if (!original || !descriptor) return false
    return 'value' in original
      ? 'value' in descriptor && descriptor.value === original.value
      : !('value' in descriptor) &&
          descriptor.get === original.get &&
          descriptor.set === original.set
  }
  function unchangedTaskFluentDelegates(assertion: object, key: string) {
    const nodes = taskNativeReceiverNodes(assertion)
    if (!nodes) return false
    // Native assert formats failed subjects through the _obj accessor.
    const dependencies =
      key === 'equal'
        ? ['assert', 'eql', '_obj']
        : key === 'lengthOf' || key === 'above'
          ? ['assert', '_obj', 'to', 'have', 'property']
          : key === 'include'
            ? ['assert', '_obj', 'property']
            : ['to', 'be', 'have', 'deep'].includes(key)
              ? []
              : ['assert', '_obj']
    for (const name of dependencies) {
      if (
        nodes.some((node) => Object.hasOwn(node, name)) ||
        !sameTaskFluentDescriptor(
          taskFluentDelegateDescriptors.get(name),
          Object.getOwnPropertyDescriptor(taskAssertionPrototype, name)
        )
      )
        return false
    }
    const original = taskChainableDescriptors.records.get(key)
    if (!original) return true
    // overwriteChainableMethod mutates this real closed-over record without
    // replacing its public accessor. Inspect only the original data objects.
    const container = Object.getOwnPropertyDescriptor(
      taskAssertionPrototype,
      '__methods'
    )
    if (
      !sameTaskFluentDescriptor(
        taskChainableDescriptors.container,
        container
      ) ||
      !container ||
      !('value' in container)
    )
      return false
    const descriptor = Object.getOwnPropertyDescriptor(container.value, key)
    if (
      !sameTaskFluentDescriptor(original.descriptor, descriptor) ||
      !descriptor ||
      !('value' in descriptor)
    )
      return false
    return (
      sameTaskFluentDescriptor(
        original.method,
        Object.getOwnPropertyDescriptor(descriptor.value, 'method')
      ) &&
      sameTaskFluentDescriptor(
        original.chainingBehavior,
        Object.getOwnPropertyDescriptor(descriptor.value, 'chainingBehavior')
      )
    )
  }
  function pureTaskFluentMember(assertion: object, key: PropertyKey) {
    const nodes = taskNativeReceiverNodes(assertion)
    return (
      typeof key === 'string' &&
      taskFluentDescriptors.has(key) &&
      !!nodes &&
      !nodes.some((node) => Object.hasOwn(node, key)) &&
      unchangedTaskFluentDelegates(assertion, key) &&
      sameTaskFluentDescriptor(
        taskFluentDescriptors.get(key),
        Object.getOwnPropertyDescriptor(taskAssertionPrototype, key)
      )
    )
  }

  function customTaskMember(assertion: object, key: PropertyKey) {
    const nodes = taskNativeReceiverNodes(assertion)
    if (!nodes || nodes.some((node) => Object.hasOwn(node, key))) return false
    const descriptor = Object.getOwnPropertyDescriptor(
      taskAssertionPrototype,
      key
    )
    return (
      !!descriptor &&
      'value' in descriptor &&
      typeof descriptor.value === 'function' &&
      taskMatcherMethods.has(descriptor.value)
    )
  }

  const localExpectations = new Map<string, TestExpect>()
  const preparedExpectations = new WeakMap<Test, TestExpect>()
  const preparedTestOwners = new WeakMap<object, Test>()
  const preparedExpectationOwners = new WeakMap<TestExpect, Test>()
  type TaskExpectationOwner = {
    kind: 'task-expect'
    task: Test
    expect: TestExpect
  }
  const taskExpectationOwners = new WeakMap<Test, TaskExpectationOwner>()
  const taskAssertionOrigins = new WeakMap<object, TaskExpectationOwner>()
  const taskAssertionRecords = new WeakMap<
    object,
    {
      raw: object
      owner: TaskExpectationOwner
      originalScope?: AssertionScope
    }
  >()
  function taskExpectation(task: Test) {
    let local = preparedExpectations.get(task)
    if (!local) {
      const definition = { id: task.id, fullTestName: task.fullTestName }
      preparedTestOwners.set(definition, task)
      local = createExpect(definition)
      preparedExpectations.set(task, local)
      preparedExpectationOwners.set(local, task)
    }
    return local
  }
  function assertTaskExpectation(owner: TaskExpectationOwner) {
    if (
      taskExpectationOwners.get(owner.task) !== owner ||
      preparedExpectations.get(owner.task) !== owner.expect ||
      preparedExpectationOwners.get(owner.expect) !== owner.task
    )
      throw new Error('Unrecognized Next task expectation owner')
  }
  function liveTaskScope(owner: TaskExpectationOwner) {
    if (disposed) return undefined
    const origin = options.peekCurrentScope?.()
    if (!origin || origin.closed) return undefined
    const scope = scopes.get(origin.context.id)
    if (!scope || scope.finalized || scope.disposed) return undefined
    if (
      scope.kind === 'collection' &&
      origin.kind === 'collection' &&
      scope.context.id === owner.task.file.id
    )
      return scope
    return scope.kind === 'attempt' &&
      origin.kind === 'attempt' &&
      scope.context === origin.context &&
      'task' in scope.context &&
      scope.context.task === owner.task
      ? scope
      : undefined
  }
  function guardTaskAssertion(
    assertion: object,
    owner: TaskExpectationOwner,
    requireScope: () => AssertionScope,
    originalScope?: AssertionScope
  ) {
    const proxies = new WeakMap<object, object>()
    function remember(value: object) {
      const identity = chaiAssertionIdentity(value)
      if (!identity) throw new Error('Unrecognized Chai assertion origin')
      const prior = taskAssertionOrigins.get(identity)
      if (prior && prior !== owner)
        throw new Error(
          'Assertion belongs to a different Next task expectation'
        )
      taskAssertionOrigins.set(identity, owner)
    }
    function check(value?: object) {
      assertTaskExpectation(owner)
      if (value) {
        const identity = chaiAssertionIdentity(value)
        const scope = identity && assertionOrigins.get(identity)
        // An explicit resource-bearing dispatch retains its real scope fence.
        if (scope) assertStrictScope(scope)
      }
    }
    function wrap(value: object): object {
      const cached = proxies.get(value)
      if (cached) return cached
      const proxy = new Proxy(value, {
        get(target, key, receiver) {
          const nativeFunction =
            typeof target === 'function' && !!taskNativeReceiverNodes(target)
          check(
            typeof target === 'function' && !nativeFunction ? undefined : target
          )
          if (key === 'then' && !Reflect.has(target, key)) return undefined
          if (typeof target === 'function') {
            if (
              ['call', 'apply', 'bind', 'name', 'length'].includes(String(key))
            )
              return Reflect.get(target, key, receiver)
            if (!nativeFunction) {
              requireScope()
              return Reflect.get(target, key, receiver)
            }
          }
          const own = Object.getOwnPropertyDescriptor(target, key)
          if (own && 'value' in own && typeof own.value === 'function')
            return own.value
          if (key === 'not' && own && !('value' in own)) {
            // Chai's real Proxy supplies the underlying assertion as the
            // authored getter receiver. Its returned alias can differ from
            // the original public assertion without acquiring a new Task.
            const result = Reflect.get(target, key, target)
            const admitted = taskMatcherAssertion(result)
            if (admitted) {
              admitted.assert()
              return admitted.publish(result as object)
            }
            return result
          }
          const nativeHardMember = pureTaskMember(target, key)
          const nativeFluentMember = pureTaskFluentMember(target, key)
          if (
            nativeHardMember ||
            nativeFluentMember ||
            customTaskMember(target, key)
          ) {
            const result = Reflect.get(target, key, target)
            if (typeof result === 'function') {
              if (nativeHardMember && taskThrowMember(key))
                taskThrowCallables.add(result)
              if (nativeFluentMember)
                taskFluentCallables.set(result, String(key))
              if (nativeFluentMember && chaiAssertionIdentity(result)) {
                rememberTaskChainableReceiver(result, target)
                remember(result)
              }
              return wrap(result)
            }
            if (chaiAssertionIdentity(result)) {
              remember(result as object)
              return wrap(result as object)
            }
            return result
          }
          // Unmeasured async/soft/snapshot/plugin paths use a real own scope.
          const scope = originalScope ?? requireScope()
          assertStrictScope(scope)
          return Reflect.get(guardAssertion(target, scope), key)
        },
        apply(target, thisArg, args) {
          check()
          const receiver =
            thisArg &&
            (typeof thisArg === 'object' || typeof thisArg === 'function')
              ? taskAssertionRecords.get(thisArg)
              : undefined
          if (receiver) {
            assertTaskExpectation(receiver.owner)
            check(receiver.raw)
          }
          const rawReceiver = receiver?.raw ?? thisArg
          const fluentMember = taskFluentCallables.get(target as Function)
          if (
            taskMatcherAssertion(rawReceiver) &&
            ((taskThrowCallables.has(target as Function) &&
              !unchangedTaskThrowDelegates(rawReceiver)) ||
              (fluentMember &&
                !unchangedTaskFluentDelegates(rawReceiver, fluentMember)))
          ) {
            // A callable captured before a delegate replacement retains the
            // existing scope route; classification never reads its getter.
            const scope =
              receiver?.originalScope ?? originalScope ?? requireScope()
            assertStrictScope(scope)
          }
          const result = Reflect.apply(
            target as (...args: unknown[]) => unknown,
            rawReceiver,
            args
          )
          if (chaiAssertionIdentity(result)) {
            if (
              receiver &&
              (receiver.owner !== owner ||
                receiver.originalScope !== originalScope)
            )
              return guardTaskAssertion(
                result as object,
                receiver.owner,
                requireScope,
                receiver.originalScope
              )
            remember(result as object)
            return wrap(result as object)
          }
          return result
        },
      })
      proxies.set(value, proxy)
      const identity = chaiAssertionIdentity(value)
      if (identity) {
        taskAssertionRecords.set(proxy, {
          raw: value,
          owner,
          originalScope,
        })
        const record: TaskMatcherAssertion = {
          task: owner.task,
          assertion: proxy,
          assert: () => check(value),
          live: () => !!liveTaskScope(owner),
          publish(result) {
            if (!taskMatcherReceivers.has(result)) {
              const alias = {
                ...record,
                assertion: result,
                assert: () => check(result),
              }
              taskMatcherReceivers.set(result, alias)
              const returnedIdentity = chaiAssertionIdentity(result)
              if (
                returnedIdentity &&
                !taskMatcherAssertions.has(returnedIdentity)
              )
                taskMatcherAssertions.set(returnedIdentity, alias)
            }
            return result
          },
        }
        const flagOwner = {
          task: owner.task,
          assert: () => assertTaskExpectation(owner),
        }
        taskMatcherFlagOwners.set(owner.task, flagOwner)
        if (
          originalScope?.kind === 'attempt' &&
          'task' in originalScope.context &&
          originalScope.context.task === owner.task
        )
          taskMatcherFlagOwners.set(originalScope.task, flagOwner)
        taskMatcherReceivers.set(value, record)
        taskMatcherReceivers.set(proxy, record)
        if (!taskMatcherAssertions.has(identity))
          taskMatcherAssertions.set(identity, record)
      }
      return proxy
    }
    remember(assertion)
    return wrap(assertion)
  }
  function createExpect(test?: {
    id: string
    fullTestName?: string
  }): TestExpect {
    requireAssertionAccess()
    const taskOwner = test && preparedTestOwners.get(test)
    function expectationScope() {
      if (taskOwner) {
        const scope = current()
        if (
          scope.kind === 'collection' &&
          scope.context.id === taskOwner.file.id
        )
          return scope
      }
      if (test && fileAssertionLifetime) {
        requireAssertionAccess()
        const origin = originatingScope()
        if (
          origin &&
          'testId' in origin.context &&
          (taskOwner
            ? origin.context.task === taskOwner
            : origin.context.testId === test.id)
        )
          return origin
        const retained = [...scopes.values()].filter(
          (scope) =>
            'testId' in scope.context &&
            (taskOwner
              ? scope.context.task === taskOwner
              : scope.context.testId === test.id)
        )
        const latest = retained[retained.length - 1]
        if (!latest)
          throw new Error('Expectation belongs to a different Next test.')
        return latest
      }
      const scope = current()
      if (
        test &&
        (scope.kind !== 'attempt' ||
          !('testId' in scope.context) ||
          (taskOwner
            ? scope.context.task !== taskOwner
            : scope.context.testId !== test.id))
      ) {
        throw new Error('Expectation belongs to a different Next test.')
      }
      return scope
    }
    function requireExpectationAccess() {
      requireAssertionAccess()
      if (test && scopes.size) expectationScope()
    }
    let taskExpectationOwner: TaskExpectationOwner | undefined
    const expect = ((value: unknown, message?: string) => {
      if (taskExpectationOwner && !liveTaskScope(taskExpectationOwner)) {
        assertTaskExpectation(taskExpectationOwner)
        getState(expect).assertionCalls++
        const assertion = chai.expect(value, message)
        chai.util.flag(assertion, 'vitest-test', taskExpectationOwner.task)
        return guardTaskAssertion(
          assertion,
          taskExpectationOwner,
          expectationScope
        )
      }
      const scope = expectationScope()
      const taskScope =
        !test && (fileAssertionLifetime || scope.kind === 'attempt')
          ? runningAttempt
          : scope.kind === 'file-fixtures' && !test
            ? liveFileFixtureAttempt()
            : scope
      const task =
        !test && options.getCurrentTest
          ? options.getCurrentTest()
          : taskScope?.kind === 'attempt' && 'testId' in taskScope.context
            ? (taskScope.context.task ?? taskScope.task)
            : taskScope?.task
      const state = getState(expect)
      state.assertionCalls++
      const assertion = chai.expect(value, message)
      // Publish the actual Test when present. The primitive adapter retains
      // async bookkeeping in its existing real assertion scope.
      if (taskOwner || task)
        chai.util.flag(assertion, 'vitest-test', taskOwner ?? task)
      return taskExpectationOwner
        ? guardTaskAssertion(
            assertion,
            taskExpectationOwner,
            expectationScope,
            scope
          )
        : guardAssertion(assertion, scope)
    }) as TestExpect
    if (taskOwner && !fileAssertionLifetime && options.peekCurrentScope) {
      taskExpectationOwner = { kind: 'task-expect', task: taskOwner, expect }
      taskExpectationOwners.set(taskOwner, taskExpectationOwner)
    }
    Object.assign(expect, chai.expect)
    const globals = globalThis as typeof globalThis & Record<symbol, unknown>
    Object.assign(expect, globals[ASYMMETRIC_MATCHERS_OBJECT])
    expect.soft = ((value: unknown, message?: string) => {
      if (taskExpectationOwner) expectationScope()
      return (expect(value, message) as any).withContext({ soft: true })
    }) as TestExpect['soft']
    expect.poll = ((
      callback: (options: {
        signal: AbortSignal
      }) => unknown | Promise<unknown>,
      pollOptions: {
        interval?: number
        timeout?: number
        message?: string
      } = {}
    ) => {
      const scope = expectationScope()
      const task =
        scope.kind === 'file-fixtures'
          ? liveFileFixtureAttempt()?.task
          : scope.task
      if (!task) throw new Error('expect.poll() must be called inside a test')
      if (typeof callback !== 'function')
        throw new TypeError('expect.poll() requires a callback')
      const interval =
        pollOptions.interval ?? runtimeConfig.expect?.poll?.interval ?? 50
      const timeout =
        pollOptions.timeout ?? runtimeConfig.expect?.poll?.timeout ?? 1000
      if (!Number.isFinite(interval) || interval < 0)
        throw new TypeError(
          'expect.poll() interval must be a non-negative number'
        )
      if (!Number.isFinite(timeout) || timeout < 0)
        throw new TypeError(
          'expect.poll() timeout must be a non-negative number'
        )
      const assertion = expect(null, pollOptions.message)
      chai.util.flag(assertion, 'poll', true)
      const unsupported = new Set([
        'resolves',
        'rejects',
        'toMatchSnapshot',
        'toMatchInlineSnapshot',
        'toMatchFileSnapshot',
        'toThrowErrorMatchingSnapshot',
        'toThrowErrorMatchingInlineSnapshot',
        'toThrow',
        'toThrowError',
        'throws',
        'throw',
        'Throw',
      ])
      let awaited = false
      let running: Promise<void> | undefined
      const callsite = new Error('expect.poll() assertion failed')
      const proxy = new Proxy(assertion as object, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver)
          if (value instanceof chai.Assertion) return proxy
          if (typeof value !== 'function') return value
          if (
            property === 'then' ||
            property === 'catch' ||
            property === 'finally'
          )
            return undefined
          if (typeof property === 'string' && unsupported.has(property)) {
            throw new SyntaxError(
              `expect.poll() is not supported in combination with .${property}().`
            )
          }
          return (...args: unknown[]) => {
            const run = async () => {
              const started = realDateNow()
              let lastError: unknown
              do {
                expectationScope()
                const signal =
                  'signal' in scope.context ? scope.context.signal : undefined
                signal?.throwIfAborted()
                try {
                  chai.util.flag(
                    assertion,
                    'object',
                    await callback({
                      signal: signal ?? new AbortController().signal,
                    })
                  )
                  await Reflect.apply(value, assertion, args)
                  return
                } catch (error) {
                  lastError = error
                }
                const remaining = timeout - (realDateNow() - started)
                if (remaining <= 0) break
                await new Promise((resolve) =>
                  realSetTimeout(resolve, Math.min(interval, remaining))
                )
              } while (realDateNow() - started <= timeout)
              if (lastError instanceof Error && callsite.stack) {
                lastError.cause ??= new Error(
                  'Matcher did not succeed in time.'
                )
                lastError.stack = callsite.stack.replace(
                  callsite.message,
                  lastError.message
                )
              }
              throw (
                lastError ?? new Error('expect.poll() did not resolve in time')
              )
            }
            running ??= run()
            // Finalization reports missing consumption; observe the rejection now
            // so an unawaited failed poll cannot escape as a process rejection.
            void running.catch(() => {})
            return {
              then(onFulfilled: any, onRejected: any) {
                awaited = true
                return running!.then(onFulfilled, onRejected)
              },
              catch(onRejected: any) {
                awaited = true
                return running!.catch(onRejected)
              },
              finally(onFinally: any) {
                awaited = true
                return running!.finally(onFinally)
              },
            }
          }
        },
      })
      task.onFinished?.push(() => {
        if (!awaited) {
          const error = new Error(
            'expect.poll() assertion was not awaited. This assertion is asynchronous and must be awaited.'
          )
          if (callsite.stack)
            error.stack = callsite.stack.replace(
              callsite.message,
              error.message
            )
          throw error
        }
      })
      return proxy
    }) as TestExpect['poll']
    expect.unreachable = (message) => {
      requireExpectationAccess()
      chai.assert.fail(
        `expected${message ? ` "${message}" ` : ' '}not to be reached`
      )
    }
    expect.addSnapshotSerializer = (plugin) => {
      requireExpectationAccess()
      addSerializer(plugin)
      const active = originatingScope()
      if (active && active.kind !== 'collection' && !fileOwned)
        active.serializers.add(plugin)
      else fileSerializers.add(plugin)
    }
    expect.addEqualityTesters = (testers) => {
      requireExpectationAccess()
      addCustomEqualityTesters(testers)
      equalityTesters.push(...testers)
    }
    expect.getState = () => {
      if (taskExpectationOwner) {
        assertTaskExpectation(taskExpectationOwner)
        return getState(expect)
      }
      // The eagerly published instance exposes its real accumulated state to
      // the same file's suite hooks. Calls and state writes remain case-owned.
      if (taskOwner && current().kind === 'hook') requireAssertionAccess()
      else requireExpectationAccess()
      return getState(expect)
    }
    expect.setState = (state) => {
      requireExpectationAccess()
      setState(state, expect)
    }
    expect.extend = (matchers) => {
      requireExpectationAccess()
      const matcherInvocations: {
        current?: { assertion: unknown; captured: boolean; task?: unknown }
      } = {}
      const projectedMatchers = Object.fromEntries(
        Object.entries(matchers).map(([name, matcher]) => [
          name,
          typeof matcher === 'function'
            ? new Proxy(matcher, {
                apply(target, state, args) {
                  const invocation = matcherInvocations.current
                  if (invocation && invocation.assertion === state?.assertion) {
                    invocation.captured = true
                    invocation.task = state.task
                  }
                  const owner = taskMatcherAssertion(state?.assertion)
                  const flagOwner =
                    state?.task &&
                    (typeof state.task === 'object' ||
                      typeof state.task === 'function')
                      ? taskMatcherFlagOwners.get(state.task)
                      : undefined
                  if (owner) {
                    owner.assert()
                    state.assertion = owner.assertion
                  }
                  if (flagOwner) {
                    flagOwner.assert()
                    state.task = flagOwner.task
                    state.currentTestName = flagOwner.task.fullTestName
                  }
                  return Reflect.apply(target, state, args)
                },
              })
            : matcher,
        ])
      ) as Parameters<ExpectStatic['extend']>[0]
      ;(
        chai.expect as unknown as {
          extend(
            expect: ExpectStatic,
            matchers: Parameters<ExpectStatic['extend']>[0]
          ): void
        }
      ).extend(expect, projectedMatchers)
      for (const name of Object.keys(matchers)) {
        const primitive = Object.getOwnPropertyDescriptor(
          chai.Assertion.prototype,
          name
        )?.value
        const scoped =
          scopedMatcherNames.has(name) ||
          !!Object.getOwnPropertyDescriptor(
            primitive,
            '__vitest_poll_takeover__'
          )?.value
        chai.util.overwriteMethod(
          chai.Assertion.prototype,
          name,
          (original: (...args: unknown[]) => any) => {
            return function customAssertion(
              this: NextTestChai.AssertionStatic,
              ...args: unknown[]
            ) {
              const invocation = { assertion: this, captured: false } as {
                assertion: unknown
                captured: boolean
                task?: unknown
              }
              const invoke = () => {
                const parent = matcherInvocations.current
                matcherInvocations.current = invocation
                try {
                  return original.apply(this, args)
                } finally {
                  matcherInvocations.current = parent
                }
              }
              const owner = taskMatcherAssertion(this)
              if (owner) {
                owner.assert()
                if (!owner.live() && !scoped) {
                  const result = invoke()
                  if (chaiAssertionIdentity(result))
                    owner.publish(result as object)
                  return result
                }
              }
              const scope = current()
              // Raw construction has no task. Browser common expect follows
              // the running test; context.expect keeps its explicit test task.
              const callsite = new Error()
              Error.captureStackTrace?.(callsite, customAssertion)
              const result = invoke()
              // The primitive has already observed the actual Task flag for
              // this invocation. Reuse it without another authored getter read.
              const flagged = getVitestAssertionTaskRuntime(
                invocation.captured
                  ? invocation.task
                  : chai.util.flag(this, 'vitest-test')
              )
              const task =
                flagged === scope.task ||
                (fileAssertionLifetime && flagged === runningAttemptTask()) ||
                (scope.kind === 'file-fixtures' &&
                  flagged === liveFileFixtureAttempt()?.task)
                  ? flagged
                  : undefined
              if (owner && !scoped && chaiAssertionIdentity(result))
                owner.publish(result as object)
              if (!task || !result || typeof result.then !== 'function')
                return result
              const promise = Promise.resolve(result).catch(
                (error: unknown) => {
                  if (error instanceof Error && callsite.stack) {
                    error.stack = `${error.name}: ${error.message}\n${callsite.stack.split('\n').slice(1).join('\n')}`
                  }
                  throw error
                }
              )
              return recordAsyncExpect(
                task,
                promise,
                `expect(actual).${name}()`,
                callsite
              )
            }
          }
        )
        const method = Object.getOwnPropertyDescriptor(
          chai.Assertion.prototype,
          name
        )?.value
        if (typeof method === 'function' && !scoped)
          taskMatcherMethods.add(method)
      }
    }
    expect.assertions = (count) => {
      const scope = expectationScope()
      const error = new Error()
      scope.assertionCounts.push({
        expect,
        error,
        body: isBodyAssertion(scope),
      })
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
      const scope = expectationScope()
      const error = new Error('expected any number of assertion, but got none')
      scope.assertionCounts.push({
        expect,
        error,
        body: isBodyAssertion(scope),
      })
      Error.captureStackTrace?.(error, expect.hasAssertions)
      setState(
        { isExpectingAssertions: true, isExpectingAssertionsError: error },
        expect
      )
    }
    setState(
      {
        ...getState(globals[GLOBAL_EXPECT] as ExpectStatic),
        assertionCalls: 0,
        expectedAssertionsNumber: null,
        expectedAssertionsNumberErrorGen: null,
        isExpectingAssertions: false,
        isExpectingAssertionsError: null,
        testPath: options.testPath,
        ...(test ? { currentTestName: test.fullTestName ?? '' } : {}),
      },
      expect
    )
    Object.defineProperty(expect, 'assert', { get: () => assert })
    expect.extend(customMatchers)
    return expect
  }
  const expect = createExpect()

  const previousGlobalExpect = Object.getOwnPropertyDescriptor(
    globalThis,
    GLOBAL_EXPECT
  )
  Object.defineProperty(globalThis, GLOBAL_EXPECT, {
    configurable: true,
    writable: true,
    value: expect,
  })
  function snapshotOwner() {
    const origin = current()
    const { context, kind } =
      origin.kind === 'file-fixtures'
        ? (liveFileFixtureAttempt() ?? origin)
        : origin
    if (kind !== 'attempt' || !('testId' in context))
      throw new Error(
        'Snapshots are unsupported in suite hooks without a test identity'
      )
    snapshotTests.add(context.testId)
    return context
  }
  const callSnapshotHelper: SnapshotHelperDispatch = (method, state, args) => {
    const assertion = state.assertion
    const identity = chaiAssertionIdentity(assertion)
    const origin = identity && assertionOrigins.get(identity)
    if (origin) assertStrictScope(origin)
    const assertionName = chai.util.flag(assertion, '_name') as
      | string
      | undefined
    if (!assertionName)
      throw new Error(
        'Assertion name is not set. This is a bug in Vitest. Please, open a new issue with reproduction.'
      )
    if (chai.util.flag(assertion, 'negate'))
      throw new Error(`${assertionName} cannot be used with "not"`)
    if (!chai.util.flag(assertion, 'vitest-test'))
      throw new Error(`'${assertionName}' cannot be used without test context`)
    const context = snapshotOwner()
    const shared = {
      filepath: options.testPath,
      name: context.name,
      testId: context.testId,
      assertionName,
      error:
        method === 'toMatchInlineSnapshot' ||
        method === 'toMatchDomainInlineSnapshot'
          ? (chai.util.flag(assertion, 'next-test-inline-callsite') ??
            chai.util.flag(assertion, 'error'))
          : chai.util.flag(assertion, 'error'),
    }
    if (method === 'toMatchFileSnapshot') {
      return (async () => {
        const snapshotState = snapshots.getSnapshotState(options.testPath)
        const file = await snapshotState.environment.resolveRawPath(
          options.testPath,
          args[1] as string
        )
        const content = await snapshotState.environment.readSnapshotFile(file)
        return snapshots.match({
          ...shared,
          received: args[0],
          message: args[2] as string | undefined,
          rawSnapshot: { file, content: content ?? undefined },
        })
      })()
    }
    if (
      method === 'toMatchDomainSnapshot' ||
      method === 'toMatchDomainInlineSnapshot'
    ) {
      const isInline = method === 'toMatchDomainInlineSnapshot'
      return snapshots.matchDomain({
        ...shared,
        adapter: args[0] as DomainSnapshotAdapter<any, any>,
        received: args[1],
        isInline,
        inlineSnapshot:
          isInline && args[2] !== undefined
            ? stripSnapshotIndentation(args[2] as string)
            : undefined,
        errorMessage: chai.util.flag(assertion, 'message'),
      })
    }
    if (method === 'toMatchSnapshot') {
      return snapshots.match({
        ...shared,
        received: args[0],
        properties:
          typeof args[1] === 'string'
            ? undefined
            : (args[1] as object | undefined),
        message:
          typeof args[1] === 'string'
            ? args[1]
            : (args[2] as string | undefined),
      })
    }
    const inlineSnapshot =
      typeof args[1] === 'string'
        ? args[1]
        : args[2]
          ? (args[2] as string)
          : undefined
    return snapshots.match({
      ...shared,
      received: args[0],
      isInline: true,
      properties:
        typeof args[1] === 'string'
          ? undefined
          : (args[1] as object | undefined),
      inlineSnapshot:
        inlineSnapshot === undefined
          ? undefined
          : stripSnapshotIndentation(inlineSnapshot),
      message:
        typeof args[1] === 'string'
          ? (args[2] as string | undefined)
          : (args[3] as string | undefined),
    })
  }
  function snapshotError(received: unknown, promise: string | undefined) {
    if (typeof received !== 'function') {
      if (!promise)
        throw new Error(
          `expected must be a function, received ${typeof received}`
        )
      return received
    }
    try {
      received()
    } catch (error) {
      return error
    }
    throw new Error("snapshot function didn't throw")
  }
  expect.extend({
    toMatchSnapshot(
      received,
      propertiesOrMessage?: object | string,
      message?: string
    ) {
      if (this.isNot) throw new Error('toMatchSnapshot cannot be used with not')
      const context = snapshotOwner()
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
    toMatchInlineSnapshot(
      received,
      propertiesOrSnapshot?: object | string,
      snapshotOrMessage?: string,
      message?: string
    ) {
      if (this.isNot)
        throw new Error('toMatchInlineSnapshot cannot be used with not')
      const context = snapshotOwner()
      const hasProperties =
        typeof propertiesOrSnapshot === 'object' &&
        propertiesOrSnapshot !== null
      const error =
        chai.util.flag(this.assertion, 'next-test-inline-callsite') ??
        new Error()
      const inlineSnapshot = hasProperties
        ? snapshotOrMessage
        : typeof propertiesOrSnapshot === 'string'
          ? propertiesOrSnapshot
          : undefined
      return snapshots.match({
        received,
        filepath: options.testPath,
        name: context.name,
        testId: context.testId,
        properties: hasProperties ? propertiesOrSnapshot : undefined,
        inlineSnapshot:
          inlineSnapshot === undefined
            ? undefined
            : stripSnapshotIndentation(inlineSnapshot),
        message: hasProperties ? message : snapshotOrMessage,
        error,
        isInline: true,
        assertionName: 'toMatchInlineSnapshot',
      })
    },
    toThrowErrorMatchingSnapshot(
      received,
      propertiesOrMessage?: object | string,
      message?: string
    ) {
      if (this.isNot)
        throw new Error('toThrowErrorMatchingSnapshot cannot be used with not')
      const context = snapshotOwner()
      return snapshots.match({
        received: snapshotError(
          received,
          chai.util.flag(this.assertion, 'promise')
        ),
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
        assertionName: 'toThrowErrorMatchingSnapshot',
      })
    },
    toThrowErrorMatchingInlineSnapshot(
      received,
      inlineSnapshot?: string,
      message?: string
    ) {
      if (this.isNot)
        throw new Error(
          'toThrowErrorMatchingInlineSnapshot cannot be used with not'
        )
      const context = snapshotOwner()
      return snapshots.match({
        received: snapshotError(
          received,
          chai.util.flag(this.assertion, 'promise')
        ),
        filepath: options.testPath,
        name: context.name,
        testId: context.testId,
        message,
        error:
          chai.util.flag(this.assertion, 'next-test-inline-callsite') ??
          new Error(),
        isInline: true,
        inlineSnapshot:
          inlineSnapshot === undefined
            ? undefined
            : stripSnapshotIndentation(inlineSnapshot),
        assertionName: 'toThrowErrorMatchingInlineSnapshot',
      })
    },
    async toMatchFileSnapshot(received, filepath: string, message?: string) {
      if (this.isNot)
        throw new Error('toMatchFileSnapshot cannot be used with not')
      if (typeof filepath !== 'string' || !filepath)
        throw new TypeError('toMatchFileSnapshot requires a file path')
      const context = snapshotOwner()
      const error = new Error()
      Error.captureStackTrace?.(error, (this as any).toMatchFileSnapshot)
      await snapshots.assertRaw({
        received,
        filepath: options.testPath,
        name: context.name,
        testId: context.testId,
        message,
        error,
        rawSnapshot: { file: filepath },
        assertionName: 'toMatchFileSnapshot',
      })
      return { pass: true, message: () => '' }
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
  const fileSerializers = new Set<Parameters<typeof addSerializer>[0]>()
  function removeSerializers(owned: Set<Parameters<typeof addSerializer>[0]>) {
    const serializers = getSerializers()
    for (const serializer of owned) {
      const index = serializers.indexOf(serializer)
      if (index !== -1) serializers.splice(index, 1)
    }
    owned.clear()
  }
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
  function registerMock(mock: MockInstance, restore: boolean, file = false) {
    // Setup/hook spies live through the cases and are restored at file disposal.
    // A case only restores the spies created by that case.
    if (!registeredMocks.has(mock)) {
      registeredMocks.add(mock)
      guardMockMutators(mock)
      const active = file ? undefined : originatingScope()
      if (!file && !fileOwned && active?.kind === 'attempt')
        active.mocks.add({ mock, restore })
      else fileMocks.add({ mock, restore })
    }
  }

  function trackMock<T extends (...args: any[]) => MockInstance>(
    method: T,
    restore: boolean
  ): T {
    return ((...args: Parameters<T>) => {
      requireScopeAccess()
      const mock = Reflect.apply(method, undefined, args) as MockInstance
      registerMock(mock, restore)
      return mock
    }) as T
  }

  function mockObject<T>(
    value: T,
    mockOptions?: { spy?: boolean }
  ): MaybeMockedDeep<T> {
    requireScopeAccess()
    return automockObject(
      {
        type: mockOptions?.spy ? 'autospy' : 'automock',
        globalConstructors: { Object, Function, RegExp, Array, Map },
        createMockInstance: trackedSpies.createMockInstance,
      },
      { value }
    ).value
  }

  function captureFileMockObject(): FileAutomockMaterializer {
    requireScopeAccess()
    if (!fileOwned)
      throw new Error('Browser importMock requires file-owned mock resources.')
    const createMockInstance = (
      ...args: Parameters<typeof spies.createMockInstance>
    ) => {
      if (disposed)
        throw new Error('The originating mock file has been disposed.')
      const mock = Reflect.apply(
        spies.createMockInstance,
        undefined,
        args
      ) as MockInstance
      registerMock(mock, true, true)
      return mock
    }
    return <T>(value: T, mockOptions?: { spy?: boolean }): T => {
      if (disposed)
        throw new Error('The originating mock file has been disposed.')
      return automockObject(
        {
          type: mockOptions?.spy ? 'autospy' : 'automock',
          globalConstructors: { Object, Function, RegExp, Array, Map },
          createMockInstance,
        },
        { value }
      ).value as T
    }
  }

  const trackedSpies: typeof spies & { mockObject: typeof mockObject } = {
    mockObject,
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
    context: AssertionAttempt | AssertionHook | AssertionCollection,
    kind: 'attempt' | 'hook' | 'collection' | 'file-fixtures'
  ) {
    if (disposed || scopes.has(context.id))
      throw new Error('An assertion attempt is already active or disposed')
    const promises: Promise<unknown>[] = []
    const records: AsyncAssertionRecord[] = []
    const softFailures: { error: unknown; body: boolean }[] = []
    const checks = new Map<() => void, (typeof records)[number]>()
    const coverageAfterAll =
      options.captureCoverageCompletion?.() === true &&
      kind === 'hook' &&
      'hook' in context &&
      context.hook === 'afterAll'
    const publicTask =
      kind === 'attempt' && 'testId' in context ? context.task : undefined
    const onFinished: (() => void)[] = []
    // The pinned primitive registers each consumption check immediately after
    // its promise. Keep that association after settled promises remove themselves
    // from task.promises, without treating intentionally caught failures as errors.
    Object.defineProperty(onFinished, 'push', {
      value(...values: (() => void)[]) {
        for (const check of values) {
          if (checks.get(check)?.publicFinished?.check !== check)
            checks.set(check, records[checks.size])
        }
        return Array.prototype.push.apply(this, values)
      },
    })
    // An actual Node host observes qualified BODY and authored-beforeEach events.
    // Other scopes and callers retain their existing local rejection channel.
    Object.defineProperty(promises, 'push', {
      value(...values: Promise<unknown>[]) {
        for (const value of values) {
          const record: (typeof records)[number] = {
            promise: value,
            rejected: false,
            body: isBodyAssertion(scope),
            beforeEach:
              options.observeNativeBeforeEachAssertions === true &&
              isAuthoredHookAssertion(scope, 'beforeEach'),
            afterEach:
              options.observeNativeAfterEachAssertions === true &&
              isAuthoredHookAssertion(scope, 'afterEach'),
            beforeEachCleanup:
              options.observeNativeBeforeEachCleanupAssertions === true &&
              isAuthoredHookAssertion(scope, 'cleanup'),
          }
          records.push(record)
          if (
            !options.observeNativeUnhandledAssertions ||
            (!record.body &&
              !record.beforeEach &&
              !record.afterEach &&
              !record.beforeEachCleanup)
          )
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
    if (
      kind === 'attempt' &&
      (options.getCurrentCasePhase ||
        ('onAssertionFailure' in context && context.onAssertionFailure))
    ) {
      let result: AssertionTask['result']
      Object.defineProperty(task, 'result', {
        get: () => result,
        set(value: AssertionTask['result']) {
          result = value
          if (!value) return
          let errors = value.errors
          const track = (values: unknown[] | undefined) => {
            if (!values) return values
            for (const error of values)
              softFailures.push({ error, body: false })
            return new Proxy(values, {
              get(target, key, receiver) {
                if (key === 'push')
                  return (...added: unknown[]) => {
                    for (const error of added) {
                      softFailures.push({ error, body: isBodyAssertion(scope) })
                      if ('onAssertionFailure' in context)
                        context.onAssertionFailure?.(error)
                    }
                    return target.push(...added)
                  }
                return Reflect.get(target, key, receiver)
              },
            })
          }
          errors = track(errors)
          Object.defineProperty(value, 'errors', {
            configurable: true,
            enumerable: true,
            get: () => errors,
            set: (values: unknown[] | undefined) => {
              errors = track(values)
            },
          })
        },
      })
    }
    const scope: AssertionScope = {
      context,
      kind,
      ancestors: options.getCurrentScopeAncestors?.() ?? [],
      task,
      finalized: false,
      disposed: false,
      asyncAssertions: records,
      assertionCounts: [],
      mocks: new Set<{ mock: MockInstance; restore: boolean }>(),
      serializers: new Set<Parameters<typeof addSerializer>[0]>(),
      utilities: undefined as unknown as AttemptUtilities,
    }
    scope.utilities =
      (kind === 'collection' ? collectionUtilities : fileUtilities) ??
      createAttemptUtilities(
        () => {
          if (current() !== scope)
            throw new Error(
              'Test utility belongs to a different Next assertion scope'
            )
        },
        options.fakeTimers,
        runtimeConfig,
        options.waitForImports
      )
    scopes.set(context.id, scope)
    if (kind === 'attempt') {
      runningAttempt = scope
      lastAttemptName = context.name
    }
    if (kind === 'attempt') {
      try {
        // Published 5.0.4 resets before every try, before user setup/fixtures.
        const reset = (operation: () => void) => {
          assertAssertionLifecycleScope(
            context.id,
            originatingScope()?.context.id,
            scopes.get(context.id) === scope && !disposed && !scope.finalized
          )
          mutateMocks(operation)
        }
        if (runtimeConfig.restoreMocks) reset(() => spies.restoreAllMocks())
        if (runtimeConfig.mockReset) reset(() => spies.resetAllMocks())
        if (runtimeConfig.clearMocks ?? fileOwned)
          reset(() => spies.clearAllMocks())
        if (options.unstubEnvs) scope.utilities.unstubAllEnvs()
        if (options.unstubGlobals) scope.utilities.unstubAllGlobals()
      } catch (error) {
        scopes.delete(context.id)
        if (runningAttempt === scope) runningAttempt = undefined
        throw error
      }
    }
    if (coverageAfterAll) {
      // Observe the pinned primitive's existing lifecycle callbacks only. These
      // promises remain in their actual public owner queue and stay unconsumed.
      scope.asyncAssertionObserver = {
        recorded(promise) {
          if (
            coverageAfterAllRecords.some((record) => record.promise === promise)
          )
            coverageAfterAllMetadataInvalid = true
          coverageAfterAllRecords.push({ scope, promise, settled: false })
        },
        settled(promise) {
          const ownedRecords = coverageAfterAllRecords.filter(
            (record) => record.scope === scope && record.promise === promise
          )
          if (ownedRecords.length !== 1 || ownedRecords[0].settled)
            coverageAfterAllMetadataInvalid = true
          else ownedRecords[0].settled = true
        },
      }
    }
    if (kind === 'attempt' && 'testId' in context) {
      if (context.task) {
        const observer: AsyncAssertionObserver = {
          recorded(promise) {
            promises.push(promise)
            // The actual public queue is authoritative for Node body waits,
            // including reassignment, deletion and work added after iteration.
            // Native consumption and rejection observations remain independent.
            if (
              options.observeNativeUnhandledAssertions ||
              options.observePublicTaskQueues
            )
              records[records.length - 1].publicQueue = true
          },
          settled(promise) {
            const index = promises.indexOf(promise)
            if (index !== -1) promises.splice(index, 1)
          },
          get finished() {
            return (bodyObservation || options.observePublicTaskQueues) &&
              publicTask
              ? recordPublicFinished
              : undefined
          },
        }
        scope.asyncAssertionObserver = observer
        if (
          options.getCurrentTest &&
          (options.observeNativeUnhandledAssertions ||
            options.observePublicTaskQueues)
        )
          observer.capture = () => {
            // The public Test flag can name a concurrent sibling. Capture only
            // the real invoking scope; later settlement must retain this owner.
            const currentOrigin = options.peekCurrentScope?.()
            const origin =
              currentOrigin && !currentOrigin.closed
                ? scopes.get(currentOrigin.context.id)
                : undefined
            if (
              origin?.kind === 'hook' &&
              'hook' in origin.context &&
              origin.context.hook === 'afterAll' &&
              options.captureCoverageCompletion?.() === true &&
              origin.context === currentOrigin?.context &&
              !disposed &&
              !origin.finalized &&
              !origin.disposed
            )
              return origin.asyncAssertionObserver
            return origin?.kind === 'attempt' &&
              origin.context === currentOrigin?.context &&
              scopes.get(origin.context.id) === origin &&
              !disposed &&
              !origin.finalized &&
              !origin.disposed
              ? origin.asyncAssertionObserver
              : undefined
          }
        registerVitestAssertionTaskRuntime(context.task, scope.task, observer)
      }
      const prepared = context.task && preparedExpectations.get(context.task)
      if (prepared) localExpectations.set(context.testId, prepared)
      snapshotTests.delete(context.testId)
      snapshots.clearTest(options.testPath, context.testId)
    }
    function resetTestState() {
      setState(
        {
          assertionCalls: 0,
          expectedAssertionsNumber: null,
          expectedAssertionsNumberErrorGen: null,
          isExpectingAssertions: false,
          isExpectingAssertionsError: null,
          currentTestName:
            (fileAssertionLifetime || publicTestState) && kind === 'collection'
              ? undefined
              : kind === 'hook'
                ? lastAttemptName
                : context.name,
          testPath: options.testPath,
        },
        expect
      )
    }
    if (
      kind !== 'file-fixtures' &&
      (!fileAssertionLifetime || kind !== 'hook') &&
      (!publicTestState || (kind !== 'hook' && kind !== 'attempt'))
    )
      resetTestState()
    let checkedFinished = 0
    const checkedPromises = new Set<Promise<unknown>>()
    let checkedErrors = 0
    let checkedAssertions = false
    let rejectedPromises = 0
    let checkpointFailure:
      | { error: unknown; body: boolean; nativeHook: boolean }
      | undefined
    let bodyFailure: unknown
    let completedCoverageFinalizationFailure: { error: unknown } | undefined
    function countIsBody(error: unknown) {
      const selected =
        kind === 'attempt' && 'testId' in context
          ? (localExpectations.get(context.testId) ?? expect)
          : expect
      return scope.assertionCounts.some(
        (record) =>
          record.expect === selected && record.error === error && record.body
      )
    }
    function assertionCountErrors(): unknown[] {
      if (
        kind === 'collection' ||
        kind === 'file-fixtures' ||
        ((fileAssertionLifetime || publicTestState) && kind === 'hook')
      )
        return []
      // The reference lazily selects the test-local instance, if accessed.
      // Local state survives retries/repeats; manual instances are independent.
      const selected =
        kind === 'attempt' && 'testId' in context
          ? (localExpectations.get(context.testId) ?? expect)
          : expect
      const state = getState(selected)
      if (
        state.expectedAssertionsNumber != null &&
        state.assertionCalls !== state.expectedAssertionsNumber
      ) {
        return [state.expectedAssertionsNumberErrorGen!()]
      }
      if (state.isExpectingAssertions && state.assertionCalls === 0) {
        return [state.isExpectingAssertionsError]
      }
      if (
        runtimeConfig.expect?.requireAssertions &&
        state.assertionCalls === 0
      ) {
        return [new Error('expected any number of assertion, but got none')]
      }
      return []
    }
    async function checkpoint() {
      checkpointFailure = undefined
      if (scope.finalized) return
      const errors: unknown[] = []
      const origins: boolean[] = []
      const add = (error: unknown, body: boolean) => {
        errors.push(error)
        origins.push(body)
      }
      const uncheckedPromises = (task.promises ?? []).filter((promise) => {
        if (checkedPromises.has(promise)) return false
        const owners = records.filter((record) => record.promise === promise)
        if (owners.length && owners.every((record) => record.publicQueue))
          return false
        // Authored afterEach and returned beforeEach cleanup do not join
        // pending assertions at the final reference checkpoint.
        // Only an actual unique role record leaves settlement to the native host.
        return (
          owners.length !== 1 ||
          (!owners[0].afterEach && !owners[0].beforeEachCleanup)
        )
      })
      uncheckedPromises.forEach((promise) => checkedPromises.add(promise))
      const pending = await Promise.allSettled(uncheckedPromises)
      for (const [index, result] of pending.entries()) {
        if (result.status === 'rejected') {
          rejectedPromises++
          const owners = records.filter(
            (record) => record.promise === uncheckedPromises[index]
          )
          add(
            result.reason,
            owners.length > 0 && owners.every((record) => record.body)
          )
        }
      }
      const newChecks = (task.onFinished ?? []).slice(checkedFinished)
      checkedFinished = task.onFinished?.length ?? 0
      for (const check of newChecks) {
        try {
          check()
        } catch (error) {
          const record = checks.get(check)
          if (
            options.observeNativeUnhandledAssertions &&
            (record?.body ||
              record?.beforeEach ||
              record?.afterEach ||
              record?.beforeEachCleanup)
          ) {
            record.consumptionFailure = error
            record.settledBeforeFinalization = !task.promises?.includes(
              record.promise
            )
          }
          if (record?.rejected && !errors.includes(record.error))
            add(record.error, record.body)
          add(error, record?.body === true)
        }
      }
      for (const error of (task.result?.errors ?? []).slice(checkedErrors)) {
        const owners = softFailures.filter((record) => record.error === error)
        add(error, owners.length > 0 && owners.every((record) => record.body))
      }
      checkedErrors = task.result?.errors?.length ?? 0
      if (!checkedAssertions) {
        checkedAssertions = true
        for (const error of assertionCountErrors())
          add(error, countIsBody(error))
      }
      if (errors.length) {
        const error = new AggregateError(errors, 'Test assertions failed')
        checkpointFailure = {
          error,
          body: origins.every(Boolean),
          nativeHook:
            (options.observeNativeAfterEachAssertions === true ||
              options.observeNativeBeforeEachCleanupAssertions === true) &&
            errors.every((value) => {
              const owners = records.filter(
                (record) => record.consumptionFailure === value
              )
              return (
                owners.length === 1 &&
                (owners[0].afterEach || owners[0].beforeEachCleanup)
              )
            }),
        }
        throw error
      }
    }
    let bodyObservation:
      | Set<{ attemptId: string; settled: boolean }>
      | undefined
    function recordPublicFinished(
      promise: Promise<unknown>,
      check: () => void
    ) {
      const owners = records.filter(
        (record) => record.promise === promise && record.publicQueue
      )
      if (owners.length !== 1)
        throw new Error(
          'Native finished callback requires its recorded Promise.'
        )
      const record = owners[0]
      record.publicFinished = { promise, check }
      checks.set(check, record)
    }
    async function invokeFinishedCallback(fn: Function, payload: unknown) {
      bodyFailure = undefined
      const record = checks.get(fn as () => void)
      try {
        return await fn(payload)
      } catch (error) {
        if (
          bodyObservation &&
          publicTask &&
          record?.publicFinished?.check === fn &&
          record.publicFinished.promise === record.promise &&
          records.includes(record) &&
          scopes.get(context.id) === scope &&
          !disposed &&
          !scope.finalized &&
          (record.body ||
            record.beforeEach ||
            record.afterEach ||
            record.beforeEachCleanup)
        ) {
          record.consumptionFailure = error
          record.settledBeforeFinalization = !task.promises?.includes(
            record.promise
          )
          if (record.body) {
            record.bodyFailure = error
            record.bodyFailureConsumed = false
            bodyFailure = error
          }
        }
        throw error
      }
    }
    return {
      ...(publicTestState && kind === 'attempt'
        ? {
            resetPublicTestState() {
              assertAssertionLifecycleScope(
                context.id,
                originatingScope()?.context.id,
                scopes.get(context.id) === scope &&
                  !disposed &&
                  !scope.finalized &&
                  !scope.disposed
              )
              resetTestState()
            },
          }
        : {}),
      ...(options.observeNativeUnhandledAssertions && kind === 'attempt'
        ? {
            observeBodySettlement(
              observations: Set<{ attemptId: string; settled: boolean }>
            ) {
              bodyObservation = observations
            },
          }
        : {}),
      ...(options.observeNativeUnhandledAssertions && kind === 'attempt'
        ? {
            async awaitBodyAssertions<T>(invoke: () => Promise<T>): Promise<T> {
              assertAssertionLifecycleScope(
                context.id,
                originatingScope()?.context.id,
                scopes.get(context.id) === scope &&
                  !disposed &&
                  !scope.finalized
              )
              const operation = bodyObservation
                ? { attemptId: context.id, settled: false }
                : undefined
              if (operation) bodyObservation!.add(operation)
              let result: T
              try {
                result = await invoke()
              } finally {
                if (operation) operation.settled = true
              }
              if (publicTask) {
                if (publicTask.promises) {
                  const errors = (await Promise.allSettled(publicTask.promises))
                    .map((value) =>
                      value.status === 'rejected' ? value.reason : undefined
                    )
                    .filter(Boolean)
                  if (errors.length) throw errors
                }
                return result
              }
              const live = (task.promises ?? []).filter(
                (promise) => !checkedPromises.has(promise)
              )
              live.forEach((promise) => checkedPromises.add(promise))
              const errors = (await Promise.allSettled(live)).flatMap(
                (value) => {
                  if (value.status !== 'rejected') return []
                  rejectedPromises++
                  return [value.reason]
                }
              )
              if (errors.length === 1) throw errors[0]
              if (errors.length > 1)
                throw new AggregateError(errors, 'Test assertions failed')
              return result
            },
          }
        : {}),
      ...(options.observePublicTaskQueues && kind === 'attempt' && publicTask
        ? {
            consumePublicTaskPromises<T>(value: T): T | Promise<T> {
              assertAssertionLifecycleScope(
                context.id,
                originatingScope()?.context.id,
                scopes.get(context.id) === scope &&
                  !disposed &&
                  !scope.finalized
              )
              if (!publicTask.promises) return value
              return Promise.allSettled(publicTask.promises).then((settled) => {
                const errors = settled
                  .map((result) =>
                    result.status === 'rejected' ? result.reason : undefined
                  )
                  .filter(Boolean)
                if (errors.length) throw errors
                return value
              })
            },
          }
        : {}),
      get invokeFinishedCallback() {
        return kind === 'attempt' &&
          publicTask &&
          ((options.observeNativeUnhandledAssertions && bodyObservation) ||
            options.observePublicTaskQueues)
          ? invokeFinishedCallback
          : undefined
      },
      async suspend<T>(runInner: () => Promise<T>): Promise<T> {
        if (
          kind !== 'hook' ||
          !('hook' in context) ||
          context.hook !== 'aroundAll' ||
          current() !== scope
        )
          throw new Error(
            'Only an active aroundAll assertion scope may suspend'
          )
        const state = { ...getState(expect) }
        suspendedScopes.add(scope)
        scopes.delete(context.id)
        try {
          return await runInner()
        } finally {
          suspendedScopes.delete(scope)
          if (
            disposed ||
            scope.finalized ||
            [...scopes.values()].some(
              (inner) =>
                !inner.disposed &&
                (!fileAssertionLifetime || !inner.finalized) &&
                inner.ancestors.includes(context.id)
            )
          )
            throw new Error(
              'Cannot resume aroundAll assertions before inner scopes are disposed'
            )
          if (!fileAssertionLifetime && !publicTestState) {
            const innerState = getState(expect)
            for (const key of Reflect.ownKeys(innerState))
              if (!Object.prototype.hasOwnProperty.call(state, key))
                Reflect.deleteProperty(innerState, key)
            setState(state, expect)
          }
          scopes.set(context.id, scope)
        }
      },
      get expect() {
        if (current() !== scope || !('testId' in context))
          throw new Error('context.expect requires an active Next test.')
        let local =
          context.task &&
          (fileAssertionLifetime
            ? preparedExpectations.get(context.task)
            : taskExpectation(context.task))
        if (!local) {
          const held = localExpectations.get(context.testId)
          if (
            !held ||
            !preparedExpectationOwners.has(held) ||
            preparedExpectationOwners.get(held) === context.task
          )
            local = held
        }
        if (!local) {
          local = createExpect({
            id: context.testId,
            fullTestName: context.name,
          })
        }
        localExpectations.set(context.testId, local)
        return local
      },
      markSkipped() {
        const errors = (task.result?.errors ?? []).slice(checkedErrors)
        checkedErrors = task.result?.errors?.length ?? 0
        return errors
      },
      consumeNativeHookCheckpointFailure(error: unknown) {
        if (
          (!options.observeNativeAfterEachAssertions &&
            !options.observeNativeBeforeEachCleanupAssertions) ||
          checkpointFailure === undefined ||
          checkpointFailure.error !== error ||
          !checkpointFailure.nativeHook ||
          scope.finalized ||
          disposed ||
          scopes.get(context.id) !== scope
        )
          return false
        checkpointFailure = undefined
        return true
      },
      consumeBodyFailure(error: unknown) {
        if (
          bodyFailure === undefined ||
          bodyFailure !== error ||
          scope.finalized ||
          disposed ||
          scopes.get(context.id) !== scope
        )
          return false
        for (const record of records)
          if (record.bodyFailure === error) record.bodyFailureConsumed = true
        bodyFailure = undefined
        return true
      },
      async finishTest(failed: boolean) {
        bodyFailure = undefined
        const origins: boolean[] = []
        // Counts belong to setup/body, before teardown or finished listeners.
        // Mark them consumed even if awaiting assertions times out, so later
        // cleanup cannot lend this attempt another assertion count.
        checkedAssertions = true
        const previousRejectedPromises = rejectedPromises
        const errors: unknown[] = []
        try {
          await checkpoint()
        } catch (error) {
          const values =
            error instanceof AggregateError ? error.errors : [error]
          errors.push(...values)
          origins.push(
            ...values.map(
              () =>
                checkpointFailure !== undefined &&
                checkpointFailure.error === error &&
                checkpointFailure.body
            )
          )
        }
        // The reference skips counts after a thrown body/promise failure, but
        // still checks them when a soft matcher recorded a failure.
        if (!failed && rejectedPromises === previousRejectedPromises) {
          if (kind === 'attempt') {
            assertAssertionLifecycleScope(
              context.id,
              originatingScope()?.context.id,
              scopes.get(context.id) === scope && !disposed && !scope.finalized
            )
          } else if (current() !== scope) {
            throw new Error(
              'Assertion count belongs to a different Next assertion scope'
            )
          }
          for (const error of assertionCountErrors()) {
            errors.push(error)
            origins.push(countIsBody(error))
          }
        }
        if (errors.length) {
          const error =
            errors.length === 1
              ? errors[0]
              : new AggregateError(errors, 'Test assertions failed')
          if (origins.every(Boolean)) {
            bodyFailure = error
            for (const record of records)
              if (
                record.consumptionFailure !== undefined &&
                errors.includes(record.consumptionFailure)
              )
                record.bodyFailure = error
          }
          throw error
        }
      },
      checkpoint,
      isSettledCoverageFinalizationFailure(error: unknown) {
        return (
          coverageAfterAll &&
          completedCoverageFinalizationFailure !== undefined &&
          completedCoverageFinalizationFailure?.error === error &&
          scope.finalized &&
          !scope.disposed &&
          !disposed &&
          scopes.get(context.id) === scope
        )
      },
      async finalize() {
        completedCoverageFinalizationFailure = undefined
        try {
          await checkpoint()
        } catch (error) {
          if (coverageAfterAll && checkpointFailure?.error === error)
            completedCoverageFinalizationFailure = { error }
          throw error
        } finally {
          scope.finalized = true
        }
      },
      async dispose() {
        if (
          (options.observeNativeUnhandledAssertions && scope.disposed) ||
          scopes.get(context.id) !== scope
        )
          return
        scope.disposed = true
        scope.finalized = true
        const errors: unknown[] = []
        try {
          try {
            if (!fileOwned && kind !== 'collection') scope.utilities.dispose()
          } catch (error) {
            errors.push(error)
          }
          removeSerializers(scope.serializers)
          errors.push(...drainMocks(scope.mocks))
        } finally {
          if (
            !fileAssertionLifetime &&
            (!options.observeNativeUnhandledAssertions || kind !== 'attempt') &&
            !(coverageAfterAll && options.observeNativeUnhandledAssertions)
          )
            scopes.delete(context.id)
          if (runningAttempt === scope) runningAttempt = undefined
        }
        if (errors.length)
          throw new AggregateError(errors, 'Test assertion cleanup failed')
      },
    }
  }

  // Each helper uses the literal upstream algorithm. Its lexical constructor
  // is a genuine admitted public construction, before a plugin can run. A
  // hidden callback never adopts an assertion from the ambient current scope.
  const helperInterfaces = new WeakMap<object, typeof chai.assert>()
  function helperAssertionConstructor(prototype: object) {
    return function (...args: unknown[]) {
      return constructChaiNamespaceAssertion(args, prototype)
    } as unknown as typeof chai.Assertion
  }
  function ownedAssertInterface(prototype: object) {
    let helpers = helperInterfaces.get(prototype)
    if (!helpers) {
      helpers = createChaiAssertInterface(
        helperAssertionConstructor(prototype),
        function (...args: Parameters<typeof chai.util.flag>) {
          assertChaiNamespaceAccess()
          return Reflect.apply(chai.util.flag, chai.util, [
            strictUnwrap(args[0]),
            ...args.slice(1),
          ])
        }
      )
      helperInterfaces.set(prototype, helpers)
    }
    return helpers
  }
  function callChaiAssert(
    key: PropertyKey | undefined,
    args: unknown[],
    prototype: object = defaultChaiPrototype
  ) {
    assertChaiNamespaceAccess()
    const helpers = ownedAssertInterface(prototype)
    return Reflect.apply(
      key === undefined ? helpers : Reflect.get(helpers, key),
      helpers,
      args
    )
  }
  const assertMethods = new Map<PropertyKey, Function>()
  const assert = new Proxy(chai.assert, {
    apply(_target, _thisArg, args) {
      return callChaiAssert(undefined, args)
    },
    get(target, key) {
      requireAssertionAccess()
      const value = Reflect.get(target, key)
      if (typeof value !== 'function') return value
      let method = assertMethods.get(key)
      if (!method) {
        method = (...args: unknown[]) => callChaiAssert(key, args)
        assertMethods.set(key, method)
      }
      return method
    },
  })

  let previousShould: PropertyDescriptor | undefined
  let ownedShould: (() => unknown) | undefined
  function should(
    prototype: object = defaultChaiPrototype
  ): ReturnType<typeof chai.should> {
    requireAssertionAccess()
    if (!ownedShould)
      previousShould = Object.getOwnPropertyDescriptor(
        Object.prototype,
        'should'
      )
    const helpers = createChaiShouldInterface(
      helperAssertionConstructor(prototype)
    )()
    const descriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      'should'
    )!
    const getter = descriptor.get!
    ownedShould = function (this: unknown) {
      requireAssertionAccess()
      const assertion = Reflect.apply(getter, this, [])
      const record = strictAssertionRecords.get(assertion)
      if (!record) throw new Error('Unrecognized owned Chai should assertion')
      assertStrictScope(record.scope)
      return assertion
    }
    // eslint-disable-next-line no-extend-native -- Chai's should plugin installs a file-owned prototype getter.
    Object.defineProperty(Object.prototype, 'should', {
      ...descriptor,
      get: ownedShould,
    })
    const objects = new WeakMap<object, object>()
    const guard = <T extends object>(target: T): T => {
      let proxy = objects.get(target)
      if (!proxy) {
        const methods = new Map<PropertyKey, Function>()
        proxy = new Proxy(Object.create(null) as object, {
          get(_object, key) {
            requireAssertionAccess()
            const value = Reflect.get(target, key, target)
            if (typeof value === 'function') {
              let method = methods.get(key)
              if (!method) {
                method = (...args: unknown[]) => {
                  requireAssertionAccess()
                  return Reflect.apply(value, target, args)
                }
                methods.set(key, method)
              }
              return method
            }
            return value && typeof value === 'object' ? guard(value) : value
          },
          ownKeys() {
            requireAssertionAccess()
            return Reflect.ownKeys(target)
          },
          getOwnPropertyDescriptor(_object, key) {
            requireAssertionAccess()
            const memberDescriptor = Reflect.getOwnPropertyDescriptor(
              target,
              key
            )
            return (
              memberDescriptor && {
                configurable: true,
                enumerable: memberDescriptor.enumerable,
                writable: true,
                value: Reflect.get(proxy!, key),
              }
            )
          },
          getPrototypeOf() {
            requireAssertionAccess()
            return null
          },
        })
        objects.set(target, proxy)
      }
      return proxy as T
    }
    return guard(helpers)
  }

  const runtime = {
    callSnapshotHelper,
    expect,
    createExpect,
    createChaiAssertion,
    createChaiNamespaceAssertion,
    constructChaiNamespaceAssertion,
    assertChaiNamespaceAccess,
    chaiEvents,
    readChaiPrototype,
    readChaiPrototypeDescriptor,
    registerChaiAssertionMember,
    callChaiUtility,
    isChaiNamespaceAssertion(value: unknown) {
      assertChaiNamespaceAccess()
      return (
        !!value &&
        (typeof value === 'object' || typeof value === 'function') &&
        strictAssertionRecords.has(value)
      )
    },
    callChaiExpectFail(args: unknown[]) {
      assertChaiNamespaceAccess()
      return Reflect.apply(chai.expect.fail, chai.expect, args)
    },
    chaiUtilityKeys() {
      assertChaiNamespaceAccess()
      return Reflect.ownKeys(chai.util)
    },
    callChaiCheckError(key: PropertyKey, args: unknown[]) {
      assertChaiNamespaceAccess()
      const utilities = Reflect.get(chai.util, 'checkError')
      const fn = utilities && Reflect.get(utilities, key)
      if (typeof fn !== 'function')
        throw new Error('Unknown Chai error utility')
      return Reflect.apply(fn, utilities, args)
    },
    readChaiConfig(key: PropertyKey, legacyAssertion = false) {
      assertChaiNamespaceAccess()
      return Reflect.get(legacyAssertion ? chai.Assertion : chai.config, key)
    },
    writeChaiConfig(key: PropertyKey, value: unknown, legacyAssertion = false) {
      assertChaiNamespaceAccess()
      return Reflect.set(
        legacyAssertion ? chai.Assertion : chai.config,
        key,
        value
      )
    },
    chaiConfigKeys() {
      assertChaiNamespaceAccess()
      return Reflect.ownKeys(chai.config)
    },
    chaiAssertionError() {
      assertChaiNamespaceAccess()
      return chai.AssertionError
    },
    useChaiPlugin(plugin: Parameters<typeof chai.use>[0]) {
      assertChaiNamespaceAccess()
      let delegate = chaiPluginDelegates.get(plugin)
      if (!delegate) {
        delegate = () => Reflect.apply(plugin, undefined, [])
        chaiPluginDelegates.set(plugin, delegate)
      }
      // No internal caller receives the raw Chai exports/utility arguments.
      chai.use(delegate)
    },
    assert,
    callChaiAssert,
    should,
    spies: trackedSpies,
    captureFileMockObject,
    getRealTimerWaits,
    utilities: new Proxy({} as AttemptUtilities, {
      get(_target, property) {
        requireScopeAccess()
        const origin = originatingScope()
        const utility = Reflect.get(
          fileUtilities ?? current().utilities,
          property
        )
        if (typeof utility !== 'function') return utility
        return (...args: unknown[]) => {
          requireScopeAccess()
          if (origin && current() !== origin)
            throw new Error(
              'Test utility belongs to a different Next assertion scope'
            )
          return Reflect.apply(
            utility,
            fileUtilities ?? current().utilities,
            args
          )
        }
      },
    }),
    observeNativeBodyRejection(reason: unknown, promise: Promise<unknown>) {
      if (
        !options.observeNativeUnhandledAssertions ||
        nativeRejectionRecordsReleased
      )
        return false
      const owners = [...scopes.values()].flatMap((scope) =>
        scope.asyncAssertions
          .filter((record) => record.promise === promise)
          .map((record) => ({ scope, record }))
      )
      if (owners.length !== 1) return false
      const { scope, record } = owners[0]
      if (
        scope.kind !== 'attempt' ||
        !record.body ||
        record.nativeUnhandled !== undefined ||
        scope.task.promises?.includes(promise) ||
        ((scope.finalized || disposed) &&
          (!record.settledBeforeFinalization || !record.bodyFailureConsumed))
      )
        return false
      record.nativeUnhandled = { reason }
      if (!scope.finalized) record.settledBeforeFinalization = true
      return true
    },
    observeNativeHookRejection(reason: unknown, promise: Promise<unknown>) {
      if (
        !options.observeNativeUnhandledAssertions ||
        (!options.observeNativeBeforeEachAssertions &&
          !options.observeNativeAfterEachAssertions &&
          !options.observeNativeBeforeEachCleanupAssertions) ||
        nativeRejectionRecordsReleased
      )
        return false
      const owners = [...scopes.values()].flatMap((scope) =>
        scope.asyncAssertions
          .filter((record) => record.promise === promise)
          .map((record) => ({ scope, record }))
      )
      if (owners.length !== 1) return false
      const { scope, record } = owners[0]
      if (
        scope.kind !== 'attempt' ||
        (!record.beforeEach &&
          !record.afterEach &&
          !record.beforeEachCleanup) ||
        record.nativeUnhandled !== undefined ||
        scope.task.promises?.includes(promise) ||
        ((scope.finalized || disposed) &&
          (record.consumptionFailure === undefined ||
            (!record.afterEach &&
              !record.beforeEachCleanup &&
              !record.settledBeforeFinalization)))
      )
        return false
      record.nativeUnhandled = { reason }
      if (!scope.finalized) record.settledBeforeFinalization = true
      return true
    },
    observeNativeAfterAllCoverageRejection(
      reason: unknown,
      promise: Promise<unknown>
    ) {
      if (
        options.captureCoverageCompletion?.() !== true ||
        nativeRejectionRecordsReleased ||
        coverageAfterAllMetadataInvalid
      )
        return false
      const owners = coverageAfterAllRecords.filter(
        (record) => record.promise === promise
      )
      if (
        owners.length !== 1 ||
        (!owners[0].settled && !owners[0].hostSettlement) ||
        owners[0].observed !== undefined
      ) {
        if (owners.length) coverageAfterAllMetadataInvalid = true
        return false
      }
      const record = owners[0]
      const origin = options.peekCurrentScope?.()
      if (
        origin?.kind !== 'hook' ||
        origin.context !== record.scope.context ||
        record.scope.kind !== 'hook' ||
        !('hook' in record.scope.context) ||
        record.scope.context.hook !== 'afterAll' ||
        scopes.get(record.scope.context.id) !== record.scope
      )
        return false
      record.settled = true
      record.observed = { reason }
      return true
    },
    hasCompleteNativeAfterAllCoverageRejections() {
      return (
        options.captureCoverageCompletion?.() === true &&
        !nativeRejectionRecordsReleased &&
        !coverageAfterAllMetadataInvalid &&
        coverageAfterAllRecords.every(
          (record) =>
            !record.observed ||
            (record.settled &&
              record.scope.finalized &&
              record.scope.disposed &&
              scopes.get(record.scope.context.id) === record.scope)
        )
      )
    },
    hasCompleteNativeBodyRejections() {
      if (nativeRejectionRecordsReleased) return false
      return [...scopes.values()].every((scope) =>
        scope.asyncAssertions.every(
          (record) =>
            !record.nativeUnhandled ||
            (record.body &&
              scope.finalized &&
              scope.disposed &&
              record.settledBeforeFinalization === true &&
              record.consumptionFailure !== undefined &&
              record.bodyFailureConsumed === true)
        )
      )
    },
    releaseNativeBodyRejectionRecords() {
      if (!disposed)
        throw new Error('Dispose assertions before releasing native records.')
      nativeRejectionRecordsReleased = true
      coverageAfterAllRecords.length = 0
      scopes.clear()
    },
    prepareTaskExpect(task: Test) {
      const scope = current()
      if (scope.kind !== 'collection' || task.file.id !== scope.context.id)
        throw new Error('Task expectations require their live file collection.')
      registerVitestAssertionTaskRuntime(task, scope.task)
      return taskExpectation(task)
    },
    beginCollection: (context: AssertionCollection) =>
      beginScope(context, 'collection'),
    beginAttempt: (context: AssertionAttempt) => beginScope(context, 'attempt'),
    beginHook: (context: AssertionHook) => beginScope(context, 'hook'),
    beginFileFixtures: (context: AssertionCollection) =>
      beginScope(context, 'file-fixtures'),
    finishSnapshotSelection(
      cases: readonly { name: string; status: string }[],
      selection: { partial: boolean; complete: boolean }
    ) {
      for (const test of cases) {
        if (test.status === 'skipped' || test.status === 'cancelled')
          snapshots.skipTest(options.testPath, test.name)
      }
      snapshotSelection = selection
    },
    getSnapshotSummary() {
      return snapshotResult
        ? {
            ...snapshotResult,
            uncheckedKeys: [...snapshotResult.uncheckedKeys],
          }
        : undefined
    },
    takeSnapshotUpdates() {
      if (!disposed)
        throw new Error('Finish assertions before taking snapshot updates.')
      const updates = stagedSnapshots.take()
      return snapshotTests.size ||
        (snapshotSelection?.complete &&
          snapshotOptions.updateSnapshot === 'all')
        ? updates
        : []
    },
    async finishFile() {
      if (
        (fileAssertionLifetime || options.observeNativeUnhandledAssertions
          ? [...scopes.values()].some((scope) => !scope.finalized)
          : scopes.size) ||
        suspendedScopes.size
      )
        throw new Error('Cannot finish assertions with an active attempt')
      if (disposed) return
      disposed = true
      const errors: unknown[] = []
      try {
        eventBridge?.dispose()
      } catch (error) {
        errors.push(error)
      }
      let result: Awaited<ReturnType<SnapshotClient['finish']>> | undefined
      try {
        if (!options.collectOnly) {
          const state = snapshots.getSnapshotState(options.testPath)
          if (!snapshotSelection || !snapshotSelection.complete) {
            // Unselected/skipped test keys are marked checked by the runner.
            // Incomplete collection/cleanup never authorizes any pruning.
            state.removeUncheckedKeys = () => {}
          }
          result = await snapshots.finish(options.testPath)
          snapshotResult = result
          if (
            snapshotOptions.updateSnapshot === 'none' &&
            snapshotSelection?.complete &&
            !snapshotSelection.partial &&
            result.unchecked > 0
          ) {
            throw new Error(
              `Obsolete snapshots found (${result.unchecked}); run with --update to remove them.`
            )
          }
        }
      } catch (error) {
        errors.push(error)
      }
      try {
        collectionUtilities.dispose()
      } catch (error) {
        errors.push(error)
      }
      try {
        realTimerWaits?.dispose()
      } catch (error) {
        errors.push(error)
      }
      errors.push(...drainMocks(fileMocks))
      removeSerializers(fileSerializers)
      if (
        ownedShould &&
        Object.getOwnPropertyDescriptor(Object.prototype, 'should')?.get ===
          ownedShould
      ) {
        try {
          if (previousShould) {
            // eslint-disable-next-line no-extend-native -- Restore the descriptor captured before installing Chai's plugin.
            Object.defineProperty(Object.prototype, 'should', previousShould)
          } else Reflect.deleteProperty(Object.prototype, 'should')
        } catch (error) {
          errors.push(error)
        }
      }
      const testers = getCustomEqualityTesters()
      for (const tester of equalityTesters.reverse()) {
        const index = testers.lastIndexOf(tester)
        if (index !== -1) testers.splice(index, 1)
      }
      equalityTesters.length = 0
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
      closeAssertionFile()
      // The actual Node host drains native events before releasing this same
      // private owner map. Disposed assertion APIs remain closed throughout.
      if (!options.observeNativeUnhandledAssertions) scopes.clear()
      localExpectations.clear()
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
  chaiCallbackDispatches.set(runtime, callChaiPluginCallback)
  return runtime
}
