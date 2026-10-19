/// <reference lib="es2021.promise" />
import { VitestSnapshotEnvironment } from './snapshot-environment'
import {
  assertAssertionScope,
  beginAssertionFile,
  fileAssertionLifetime,
  getFileAssertionOrigin,
} from './assertion-platform'
import { createChaiEvents } from './chai-events'
import type { FileAutomockMaterializer } from '../mocking/fresh-module'
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
  chai,
  getChaiAssertionIdentity,
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
  getCurrentHook?: () => AssertionHook | undefined
  getCurrentCollection?: () => AssertionCollection | undefined
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

  type AssertionScope = {
    context: AssertionAttempt | AssertionHook | AssertionCollection
    kind: 'attempt' | 'hook' | 'collection'
    ancestors: readonly string[]
    task: AssertionTask
    finalized: boolean
    mocks: Set<{ mock: MockInstance; restore: boolean }>
    serializers: Set<Parameters<typeof addSerializer>[0]>
    utilities: AttemptUtilities
  }
  const scopes = new Map<string, AssertionScope>()
  let runningAttempt: AssertionScope | undefined
  function runningAttemptTask() {
    return runningAttempt?.task
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
    const origin = attempt ?? hook ?? collection
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
        options.getCurrentCollection?.()
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
          if (typeof result === 'function')
            return wrap(
              result,
              target,
              property === 'toMatchInlineSnapshot' ||
                property === 'toThrowErrorMatchingInlineSnapshot'
            )
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
        apply: function __INLINE_SNAPSHOT_OFFSET_1__(target, thisArg, args) {
          check()
          if (inlineSnapshot) {
            chai.util.flag(assertion, 'next-test-inline-callsite', new Error())
          }
          const result = Reflect.apply(
            target as (...args: unknown[]) => unknown,
            receiver ?? thisArg,
            args
          )
          // Promise results retain the primitive's own consumption tracking.
          return result instanceof chai.Assertion
            ? wrapProducedAssertion(result)
            : result
        },
      }
      // Production compilation minifies function identifiers. This runtime
      // name is the snapshot primitive's public stack-offset protocol.
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
    }
  >()
  function strictFunction(
    fn: Function,
    scope: AssertionScope,
    prototype: object,
    receiver?: object
  ): Function {
    const invoke = function (this: unknown, ...args: unknown[]) {
      assertStrictScope(scope)
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
        scope,
        prototype
      )
    }
    const proxy = new Proxy(invoke, {
      get(target, key, proxyReceiver) {
        assertStrictScope(scope)
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
          return strictFunction(value, scope, prototype, fn)
        return strictResult(value, scope, prototype)
      },
      construct(_target, args) {
        assertStrictScope(scope)
        return guardStrictChaiAssertion(
          Reflect.construct(fn, args),
          scope,
          prototype
        )
      },
      getOwnPropertyDescriptor() {
        assertStrictScope(scope)
        throw new Error(
          'This Chai assertion reflection API is not yet supported'
        )
      },
    })
    strictFunctionRecords.set(proxy, { raw: fn, scope, prototype, receiver })
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
      return strictFunction(value, current(), prototype)
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
        assertStrictScope(method.scope)
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
              method.receiver
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
      const value = Reflect.apply(fn, chai.util, [
        strictUnwrap(args[0]),
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
    if (
      key === 'transferFlags' &&
      !args
        .slice(0, 2)
        .every(
          (value) =>
            !!value &&
            (typeof value === 'object' || typeof value === 'function') &&
            strictAssertionRecords.has(value)
        )
    )
      throw new Error(
        'Chai flags can only transfer between admitted assertions'
      )
    const values =
      key === 'transferFlags'
        ? [strictUnwrap(args[0]), strictUnwrap(args[1]), ...args.slice(2)]
        : [
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

  const localExpectations = new Map<string, TestExpect>()
  function createExpect(test?: {
    id: string
    fullTestName?: string
  }): TestExpect {
    requireAssertionAccess()
    function expectationScope() {
      if (test && fileAssertionLifetime) {
        requireAssertionAccess()
        const origin = originatingScope()
        if (
          origin &&
          'testId' in origin.context &&
          origin.context.testId === test.id
        )
          return origin
        const retained = [...scopes.values()].filter(
          (scope) =>
            'testId' in scope.context && scope.context.testId === test.id
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
          scope.context.testId !== test.id)
      ) {
        throw new Error('Expectation belongs to a different Next test.')
      }
      return scope
    }
    function requireExpectationAccess() {
      requireAssertionAccess()
      if (test && scopes.size) expectationScope()
    }
    const expect = ((value: unknown, message?: string) => {
      const scope = expectationScope()
      const task =
        fileAssertionLifetime && !test ? runningAttempt?.task : scope.task
      const state = getState(expect)
      state.assertionCalls++
      const assertion = chai.expect(value, message)
      // The standalone matcher library uses this small bookkeeping object for
      // async assertions. It does not register or execute a Vitest test.
      if (task) chai.util.flag(assertion, 'vitest-test', task)
      return guardAssertion(assertion, scope)
    }) as TestExpect
    Object.assign(expect, chai.expect)
    const globals = globalThis as typeof globalThis & Record<symbol, unknown>
    Object.assign(expect, globals[ASYMMETRIC_MATCHERS_OBJECT])
    expect.soft = ((value: unknown, message?: string) =>
      (expect(value, message) as any).withContext({
        soft: true,
      })) as TestExpect['soft']
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
      scope.task.onFinished?.push(() => {
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
      requireExpectationAccess()
      return getState(expect)
    }
    expect.setState = (state) => {
      requireExpectationAccess()
      setState(state, expect)
    }
    expect.extend = (matchers) => {
      requireExpectationAccess()
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
              const scope = current()
              // Raw construction has no task. Browser common expect follows
              // the running test; context.expect keeps its explicit test task.
              const flagged = chai.util.flag(this, 'vitest-test')
              const task =
                flagged === scope.task ||
                (fileAssertionLifetime && flagged === runningAttemptTask())
                  ? flagged
                  : undefined
              const callsite = new Error()
              Error.captureStackTrace?.(callsite, customAssertion)
              const result = original.apply(this, args)
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
      }
    }
    expect.assertions = (count) => {
      expectationScope()
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
      expectationScope()
      const error = new Error('expected any number of assertion, but got none')
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
    const { context, kind } = current()
    if (kind !== 'attempt' || !('testId' in context))
      throw new Error(
        'Snapshots are unsupported in suite hooks without a test identity'
      )
    snapshotTests.add(context.testId)
    return context
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
    toMatchInlineSnapshot(
      received,
      propertiesOrSnapshot?: object | string,
      snapshotOrMessage?: string,
      message?: string
    ) {
      if (this.isNot)
        throw new Error('toMatchInlineSnapshot cannot be used with not')
      const { context, kind } = current()
      if (kind !== 'attempt' || !('testId' in context)) {
        throw new Error(
          'Snapshots are unsupported in suite hooks without a test identity'
        )
      }
      snapshotTests.add(context.testId)
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
      const { context, kind } = current()
      if (kind !== 'attempt' || !('testId' in context)) {
        throw new Error(
          'Snapshots are unsupported in suite hooks without a test identity'
        )
      }
      snapshotTests.add(context.testId)
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
    kind: 'attempt' | 'hook' | 'collection'
  ) {
    if (disposed || scopes.has(context.id))
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
    if (
      kind === 'attempt' &&
      'onAssertionFailure' in context &&
      context.onAssertionFailure
    ) {
      let result: AssertionTask['result']
      Object.defineProperty(task, 'result', {
        get: () => result,
        set(value: AssertionTask['result']) {
          result = value
          if (!value) return
          let errors = value.errors
          const track = (values: unknown[] | undefined) =>
            values &&
            new Proxy(values, {
              get(target, key, receiver) {
                if (key === 'push')
                  return (...added: unknown[]) => {
                    for (const error of added)
                      context.onAssertionFailure?.(error)
                    return target.push(...added)
                  }
                return Reflect.get(target, key, receiver)
              },
            })
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
    if (kind === 'attempt') runningAttempt = scope
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
    if (kind === 'attempt' && 'testId' in context) {
      snapshotTests.delete(context.testId)
      snapshots.clearTest(options.testPath, context.testId)
    }
    if (!fileAssertionLifetime || kind !== 'hook') {
      setState(
        {
          assertionCalls: 0,
          expectedAssertionsNumber: null,
          expectedAssertionsNumberErrorGen: null,
          isExpectingAssertions: false,
          isExpectingAssertionsError: null,
          currentTestName:
            fileAssertionLifetime && kind === 'collection'
              ? undefined
              : context.name,
          testPath: options.testPath,
        },
        expect
      )
    }
    let checkedFinished = 0
    const checkedPromises = new Set<Promise<unknown>>()
    let checkedErrors = 0
    let checkedAssertions = false
    let rejectedPromises = 0
    function assertionCountErrors(): unknown[] {
      if (kind === 'collection' || (fileAssertionLifetime && kind === 'hook'))
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
      if (scope.finalized) return
      const errors: unknown[] = []
      const uncheckedPromises = (task.promises ?? []).filter(
        (promise) => !checkedPromises.has(promise)
      )
      uncheckedPromises.forEach((promise) => checkedPromises.add(promise))
      const pending = await Promise.allSettled(uncheckedPromises)
      for (const result of pending) {
        if (result.status === 'rejected') {
          rejectedPromises++
          errors.push(result.reason)
        }
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
      if (!checkedAssertions) {
        checkedAssertions = true
        errors.push(...assertionCountErrors())
      }
      if (errors.length)
        throw new AggregateError(errors, 'Test assertions failed')
    }
    return {
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
                (!fileAssertionLifetime || !inner.finalized) &&
                inner.ancestors.includes(context.id)
            )
          )
            throw new Error(
              'Cannot resume aroundAll assertions before inner scopes are disposed'
            )
          if (!fileAssertionLifetime) {
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
        let local = localExpectations.get(context.testId)
        if (!local) {
          local = createExpect({
            id: context.testId,
            fullTestName: context.name,
          })
          localExpectations.set(context.testId, local)
        }
        return local
      },
      markSkipped() {
        const errors = (task.result?.errors ?? []).slice(checkedErrors)
        checkedErrors = task.result?.errors?.length ?? 0
        return errors
      },
      async finishTest(failed: boolean) {
        // Counts belong to setup/body, before teardown or finished listeners.
        // Mark them consumed even if awaiting assertions times out, so later
        // cleanup cannot lend this attempt another assertion count.
        checkedAssertions = true
        const previousRejectedPromises = rejectedPromises
        const errors: unknown[] = []
        try {
          await checkpoint()
        } catch (error) {
          if (error instanceof AggregateError) errors.push(...error.errors)
          else errors.push(error)
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
          errors.push(...assertionCountErrors())
        }
        if (errors.length === 1) throw errors[0]
        if (errors.length > 1)
          throw new AggregateError(errors, 'Test assertions failed')
      },
      checkpoint,
      async finalize() {
        try {
          await checkpoint()
        } finally {
          scope.finalized = true
        }
      },
      async dispose() {
        if (scopes.get(context.id) !== scope) return
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
          if (!fileAssertionLifetime) scopes.delete(context.id)
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
    expect,
    createExpect,
    createChaiAssertion,
    createChaiNamespaceAssertion,
    constructChaiNamespaceAssertion,
    assertChaiNamespaceAccess,
    chaiEvents,
    readChaiPrototype,
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
    beginCollection: (context: AssertionCollection) =>
      beginScope(context, 'collection'),
    beginAttempt: (context: AssertionAttempt) => beginScope(context, 'attempt'),
    beginHook: (context: AssertionHook) => beginScope(context, 'hook'),
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
        (fileAssertionLifetime
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
      scopes.clear()
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
