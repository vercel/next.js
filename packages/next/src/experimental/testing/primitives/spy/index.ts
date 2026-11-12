import type {
  Classes,
  Constructable,
  Methods,
  Mock,
  MockConfig,
  MockContext,
  MockInstance,
  MockInstanceOption,
  MockProcedureContext,
  MockResult,
  MockReturnType,
  MockSettledResult,
  Procedure,
  Properties,
} from './types'

export function isMockFunction(candidate: any): candidate is Mock {
  return (
    typeof candidate === 'function' &&
    '_isMockFunction' in candidate &&
    candidate._isMockFunction === true
  )
}

const MOCK_RESTORE = new Set<() => void>()

// Next's private synchronous file-restoration observation. Inactive calls retain
// the original invocation; no mock fields, promise handlers or getters are added.
type MockRestorationCall = Readonly<{
  restore: () => unknown
  mock: MockInstance
}> &
  (
    | Readonly<{ status: 'fulfilled'; value: unknown }>
    | Readonly<{ status: 'rejected'; reason: unknown }>
  )

type MockRestorationOwner = { mock?: MockInstance; ambiguous?: boolean }
type MockRestorationObservation = {
  calls: MockRestorationCall[]
  invalid: boolean
}

const MOCK_RESTORE_OWNERS = new WeakMap<() => unknown, MockRestorationOwner>()
const readMockRestoreOwner = Function.prototype.call.bind(
  WeakMap.prototype.get
) as (
  owners: WeakMap<() => unknown, MockRestorationOwner>,
  restore: () => unknown
) => MockRestorationOwner | undefined
const writeMockRestoreOwner = Function.prototype.call.bind(
  WeakMap.prototype.set
) as (
  owners: WeakMap<() => unknown, MockRestorationOwner>,
  restore: () => unknown,
  owner: MockRestorationOwner
) => void
let activeMockRestorationObservation: MockRestorationObservation | undefined

/** Next-only synchronous actual restoration occurrences. */
export function createMockRestorationObservation(): Readonly<{
  run<T>(callback: () => T): T
  take(): readonly MockRestorationCall[] | undefined
}> {
  const observation: MockRestorationObservation = { calls: [], invalid: false }
  let state = 0
  let completed: readonly MockRestorationCall[] | undefined
  return Object.freeze({
    run<T>(callback: () => T): T {
      if (state !== 0) {
        observation.invalid = true
        throw new Error('Mock restoration observation already ran.')
      }
      state = 1
      const previous = activeMockRestorationObservation
      activeMockRestorationObservation = observation
      try {
        return callback()
      } finally {
        activeMockRestorationObservation = previous
        state = 2
        try {
          completed = Object.freeze(observation.calls)
        } catch {
          observation.invalid = true
        }
      }
    },
    take() {
      return state === 2 && !observation.invalid ? completed : undefined
    },
  })
}

function observeMockRestoration(restore: () => unknown, mock?: MockInstance) {
  const observation = activeMockRestorationObservation!
  const owner = readMockRestoreOwner(MOCK_RESTORE_OWNERS, restore)
  const record = (
    outcome:
      | Readonly<{ status: 'fulfilled'; value: unknown }>
      | Readonly<{ status: 'rejected'; reason: unknown }>
  ) => {
    try {
      if (!owner || owner.ambiguous || (mock && owner.mock !== mock)) {
        observation.invalid = true
        return
      }
      observation.calls.push(
        Object.freeze({ restore, mock: owner.mock!, ...outcome })
      )
    } catch {
      observation.invalid = true
    }
  }
  try {
    const value = restore()
    record({ status: 'fulfilled', value })
    return value
  } catch (reason) {
    record({ status: 'rejected', reason })
    throw reason
  }
}

type MockRef = WeakRef<Mock<Procedure | Constructable>>
// Jest keeps the state in a separate WeakMap which is good for memory,
// but it makes the state slower to access and return different values
// if you stored it before calling `mockClear` where it will be recreated
const DIRTY_MOCK_STATES = new Set<MockRef>()
// Mocks whose implementation, once-queue or name changed since their last
// `mockReset()`, so `resetAllMocks()` only visits mocks that are not already reset
const DIRTY_MOCK_CONFIGS = new Set<MockRef>()
// a test may spy on `Set.prototype.add`, and the spy itself marks mocks dirty
const addToSet = Set.prototype.add
const MOCK_REFS = new WeakMap<Mock<Procedure | Constructable>, MockRef>()
const MOCK_FINALIZER = new FinalizationRegistry<MockRef>((ref) => {
  DIRTY_MOCK_STATES.delete(ref)
  DIRTY_MOCK_CONFIGS.delete(ref)
})
const MOCK_CONFIGS = new WeakMap<Mock<Procedure | Constructable>, MockConfig>()
const MOCKS_BY_STATE = new WeakMap<
  MockContext,
  Mock<Procedure | Constructable>
>()

function markDirty(
  set: Set<MockRef>,
  mock: Mock<Procedure | Constructable>
): void {
  let ref = MOCK_REFS.get(mock)
  if (!ref) {
    ref = new WeakRef(mock)
    MOCK_REFS.set(mock, ref)
    MOCK_FINALIZER.register(mock, ref)
  }
  addToSet.call(set, ref)
}

function unmarkDirty(
  set: Set<MockRef>,
  mock: Mock<Procedure | Constructable>
): void {
  const ref = MOCK_REFS.get(mock)
  if (ref) {
    set.delete(ref)
  }
}

function forEachDirty(
  set: Set<MockRef>,
  callback: (mock: Mock<Procedure | Constructable>) => void
): void {
  for (const ref of set) {
    const mock = ref.deref()
    if (mock) {
      callback(mock)
    } else {
      set.delete(ref)
    }
  }
}

export function createMockInstance(
  options: MockInstanceOption = {}
): Mock<Procedure | Constructable> {
  const {
    originalImplementation,
    restore,
    mockImplementation: initialMockImplementation,
    resetToMockImplementation,
    resetToMockName,
  } = options

  if (restore) {
    MOCK_RESTORE.add(restore)
  }

  const config = getDefaultConfig(originalImplementation)
  const state = getDefaultState()

  const mock = createMock({
    config,
    state,
    ...options,
  })

  if (typeof restore === 'function') {
    const previous = readMockRestoreOwner(MOCK_RESTORE_OWNERS, restore)
    writeMockRestoreOwner(
      MOCK_RESTORE_OWNERS,
      restore,
      previous ? { ambiguous: true } : { mock }
    )
  }
  const mockLength =
    (initialMockImplementation || originalImplementation)?.length ?? 0
  Object.defineProperty(mock, 'length', {
    writable: true,
    enumerable: false,
    value: mockLength,
    configurable: true,
  })
  // inherit the default name so it appears in snapshots and logs
  // this is used by `vi.spyOn()` for better debugging.
  // when `vi.fn()` is called, we just use the default string
  if (resetToMockName) {
    config.mockName = mock.name || 'vi.fn()'
  }
  MOCK_CONFIGS.set(mock, config)
  MOCKS_BY_STATE.set(state, mock)

  mock._isMockFunction = true
  mock.getMockImplementation = () => {
    // Jest only returns `config.mockImplementation` here,
    // but we think it makes sense to return what the next function will be called
    return config.onceMockImplementations[0] || config.mockImplementation
  }

  // keep the prototype chain in sync with the implementation the next
  // construction will use, so it is correct before any `new` call.
  // automocked classes are skipped: their methods are pre-mocked
  // on `mock.prototype`
  const updateMockPrototype = () => {
    if (!options.prototypeMembers?.length) {
      reparentMockPrototype(
        mock,
        config.onceMockImplementations[0] ||
          config.mockImplementation ||
          originalImplementation
      )
    }
  }

  Object.defineProperty(mock, 'mock', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: state,
  })

  mock.mockImplementation = function mockImplementation(implementation) {
    markDirty(DIRTY_MOCK_CONFIGS, mock)
    config.mockImplementation = implementation
    updateMockPrototype()
    return mock
  }

  mock.mockImplementationOnce = function mockImplementationOnce(
    implementation
  ) {
    markDirty(DIRTY_MOCK_CONFIGS, mock)
    config.onceMockImplementations.push(implementation)
    updateMockPrototype()
    return mock
  }

  mock.withImplementation = function withImplementation(
    implementation,
    callback
  ) {
    markDirty(DIRTY_MOCK_CONFIGS, mock)
    const previousImplementation = config.mockImplementation
    const previousOnceImplementations = config.onceMockImplementations

    const reset = () => {
      config.mockImplementation = previousImplementation
      config.onceMockImplementations = previousOnceImplementations
      markDirty(DIRTY_MOCK_CONFIGS, mock)
      updateMockPrototype()
    }

    config.mockImplementation = implementation
    config.onceMockImplementations = []
    updateMockPrototype()

    const returnValue = callback()

    if (
      typeof returnValue === 'object' &&
      typeof (returnValue as Promise<any>)?.then === 'function'
    ) {
      return (returnValue as Promise<any>).then(() => {
        reset()
        return mock
      }) as any
    } else {
      reset()
    }
    return mock
  }

  mock.mockReturnThis = function mockReturnThis() {
    return mock.mockImplementation(function (this: any) {
      return this
    })
  }

  mock.mockReturnValue = function mockReturnValue(value) {
    return mock.mockImplementation(function () {
      if (new.target) {
        throwConstructorError('mockReturnValue')
      }

      return value
    })
  }

  mock.mockReturnValueOnce = function mockReturnValueOnce(value) {
    return mock.mockImplementationOnce(function () {
      if (new.target) {
        throwConstructorError('mockReturnValueOnce')
      }

      return value
    })
  }

  mock.mockThrow = function mockThrow(value) {
    // oxlint-disable-next-line prefer-arrow-callback
    return mock.mockImplementation(function () {
      throw value
    })
  }

  mock.mockThrowOnce = function mockThrowOnce(value) {
    // oxlint-disable-next-line prefer-arrow-callback
    return mock.mockImplementationOnce(function () {
      throw value
    })
  }

  mock.mockResolvedValue = function mockResolvedValue(value) {
    return mock.mockImplementation(function () {
      if (new.target) {
        throwConstructorError('mockResolvedValue')
      }

      return Promise.resolve(value)
    })
  }

  mock.mockResolvedValueOnce = function mockResolvedValueOnce(value) {
    return mock.mockImplementationOnce(function () {
      if (new.target) {
        throwConstructorError('mockResolvedValueOnce')
      }

      return Promise.resolve(value)
    })
  }

  mock.mockRejectedValue = function mockRejectedValue(value) {
    return mock.mockImplementation(function () {
      if (new.target) {
        throwConstructorError('mockRejectedValue')
      }

      return Promise.reject(value)
    })
  }

  mock.mockRejectedValueOnce = function mockRejectedValueOnce(value) {
    return mock.mockImplementationOnce(function () {
      if (new.target) {
        throwConstructorError('mockRejectedValueOnce')
      }

      return Promise.reject(value)
    })
  }

  mock.mockClear = function mockClear() {
    state.calls = []
    state.contexts = []
    state.instances = []
    state.invocationCallOrder = []
    state.results = []
    state.settledResults = []
    unmarkDirty(DIRTY_MOCK_STATES, mock)
    return mock
  }

  mock.mockReset = function mockReset() {
    mock.mockClear()
    config.mockImplementation = resetToMockImplementation
      ? initialMockImplementation
      : undefined
    config.mockName = resetToMockName ? mock.name || 'vi.fn()' : 'vi.fn()'
    config.onceMockImplementations = []
    unmarkDirty(DIRTY_MOCK_CONFIGS, mock)
    updateMockPrototype()
    return mock
  }

  mock.mockRestore = function mockRestore() {
    mock.mockReset()
    return activeMockRestorationObservation && restore
      ? observeMockRestoration(restore, mock)
      : restore?.()
  }

  mock.mockName = function mockName(name: string) {
    if (typeof name === 'string') {
      markDirty(DIRTY_MOCK_CONFIGS, mock)
      config.mockName = name
    }
    return mock
  }

  mock.getMockName = function getMockName() {
    return config.mockName || 'vi.fn()'
  }

  if (Symbol.dispose) {
    mock[Symbol.dispose] = () => mock.mockRestore()
  }

  if (initialMockImplementation) {
    mock.mockImplementation(initialMockImplementation)
  } else {
    // vi.spyOn() has no mock implementation, chain the original one
    updateMockPrototype()
  }

  return mock
}

export function fn<T extends Procedure | Constructable = Procedure>(
  originalImplementation?: T
): Mock<T> {
  // if the function is already a mock, just return the same function,
  // similarly to how vi.spyOn() works
  if (
    originalImplementation != null &&
    isMockFunction(originalImplementation)
  ) {
    return originalImplementation as Mock<T>
  }

  return createMockInstance({
    // we pass this down so getMockImplementation() always returns the value
    mockImplementation: originalImplementation,
    // special case so that .mockReset() resets the value to
    // the the originalImplementation instead of () => undefined
    resetToMockImplementation: true,
  }) as Mock<T>
}

type SpyOnValue<
  T extends object,
  K extends keyof any,
> = K extends keyof Required<T> ? Required<T>[K] : (T & Record<K, unknown>)[K]

type SpyOnMethod<T extends object, K extends keyof any> =
  SpyOnValue<T, K> extends Constructable | Procedure ? SpyOnValue<T, K> : never

type SpyOnMethodKey<T extends object, K extends keyof any> =
  SpyOnValue<T, K> extends Constructable | Procedure ? K : never

export function spyOn<T extends object, S extends Properties<Required<T>>>(
  object: T,
  key: S,
  accessor: 'get'
): Mock<() => T[S]>
export function spyOn<T extends object, G extends Properties<Required<T>>>(
  object: T,
  key: G,
  accessor: 'set'
): Mock<(arg: T[G]) => void>
export function spyOn<
  T extends object,
  M extends Classes<Required<T>> | Methods<Required<T>>,
>(
  object: T,
  key: M
): Required<T>[M] extends Constructable | Procedure
  ? Mock<Required<T>[M]>
  : never
export function spyOn<T extends object, K extends keyof any>(
  object: T,
  key: SpyOnMethodKey<T, K>
): Mock<SpyOnMethod<T, K>>
export function spyOn<T extends object, K extends keyof any>(
  object: T,
  key: K,
  accessor?: 'get' | 'set'
): Mock<Procedure | Constructable> {
  assert(
    object != null,
    'The vi.spyOn() function could not find an object to spy upon. The first argument must be defined.'
  )

  assert(
    typeof object === 'object' || typeof object === 'function',
    'Vitest cannot spy on a primitive value.'
  )

  const [originalDescriptorObject, originalDescriptor] =
    getDescriptor(object, key) || []
  assert(
    originalDescriptor || key in object,
    `The property "${String(key)}" is not defined on the ${typeof object}.`
  )
  let accessType: 'get' | 'set' | 'value' = accessor || 'value'
  let ssr = false

  // vite ssr support - actual function is stored inside a getter
  if (
    accessType === 'value' &&
    originalDescriptor &&
    originalDescriptor.value == null &&
    originalDescriptor.get
  ) {
    accessType = 'get'
    ssr = true
  }

  let original: Procedure | undefined

  if (originalDescriptor) {
    original = originalDescriptor[accessType]
    // weird Proxy edge case where descriptor's value is undefined,
    // but there's still a value on the object when called
    // https://github.com/vitest-dev/vitest/issues/9439
    if (original == null && accessType === 'value') {
      original = object[key as unknown as keyof T] as unknown as Procedure
    }
  } else if (accessType !== 'value') {
    original = () => object[key as unknown as keyof T]
  } else {
    original = object[key as unknown as keyof T] as unknown as Procedure
  }

  const originalImplementation = ssr && original ? original() : original
  const originalType = typeof originalImplementation

  assert(
    // allow only functions
    originalType === 'function' ||
      // or allow getter/setter on a static value,
      // e.g. spyOn({ value: 3 }, 'value', 'get')
      (accessType !== 'value' && original == null),
    `vi.spyOn() can only spy on a function. Received ${originalType}.`
  )

  if (isMockFunction(originalImplementation)) {
    return originalImplementation
  }

  const reassign = (cb: any) => {
    const { value, ...desc } = originalDescriptor || {
      configurable: true,
      writable: true,
    }
    if (accessType !== 'value') {
      delete desc.writable // getter/setter can't have writable attribute at all
    }
    ;(desc as PropertyDescriptor)[accessType] = cb
    Object.defineProperty(object, key, desc)
  }

  const restore = () => {
    // if method is defined on the prototype, we can just remove it from
    // the current object instead of redefining a copy of it
    if (originalDescriptorObject !== object) {
      Reflect.deleteProperty(object, key)
    } else if (originalDescriptor && !original) {
      Object.defineProperty(object, key, originalDescriptor)
    } else {
      reassign(original)
    }
  }

  const mock = createMockInstance({
    restore,
    originalImplementation,
    resetToMockName: true,
  })

  try {
    reassign(ssr ? () => mock : mock)
  } catch (error) {
    if (
      error instanceof TypeError &&
      Symbol.toStringTag &&
      (object as any)[Symbol.toStringTag] === 'Module' &&
      (error.message.includes('Cannot redefine property') ||
        error.message.includes('Cannot replace module namespace') ||
        error.message.includes("can't redefine non-configurable property"))
    ) {
      throw new TypeError(
        `Cannot spy on export "${String(key)}". Module namespace is not configurable in ESM. See: https://vitest.dev/guide/mocking/modules#mocking-a-module`,
        { cause: error }
      )
    }

    throw error
  }

  return mock
}

function getDescriptor(
  obj: any,
  method: string | symbol | number
): [any, PropertyDescriptor] | undefined {
  const objDescriptor = Object.getOwnPropertyDescriptor(obj, method)
  if (objDescriptor) {
    return [obj, objDescriptor]
  }
  let currentProto = Object.getPrototypeOf(obj)
  while (currentProto !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(currentProto, method)
    if (descriptor) {
      return [currentProto, descriptor]
    }
    currentProto = Object.getPrototypeOf(currentProto)
  }
}

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

let invocationCallCounter = 1

function createMock({
  state,
  config,
  name: mockName,
  prototypeState,
  prototypeConfig,
  keepMembersImplementation,
  mockImplementation,
  prototypeMembers = [],
}: MockInstanceOption & {
  state: MockContext
  config: MockConfig
}) {
  const original = config.mockOriginal // init with vi.spyOn(obj, 'Klass')
  const pseudoOriginal = mockImplementation // init with vi.fn(Klass)
  const name = (mockName || original?.name || 'Mock') as string
  const noopImplementation = function () {}
  const prototypeMock = prototypeState && MOCKS_BY_STATE.get(prototypeState)
  const namedObject: Record<string, Mock<Procedure | Constructable>> = {
    // to keep the name of the function intact
    [name]: function (this: any, ...args: any[]) {
      markDirty(DIRTY_MOCK_STATES, namedObject[name])
      if (prototypeMock) {
        markDirty(DIRTY_MOCK_STATES, prototypeMock)
      }
      registerCalls(args, state, prototypeState)
      registerInvocationOrder(invocationCallCounter++, state, prototypeState)

      const result = {
        type: 'incomplete',
        value: undefined,
      } as MockResult<Procedure>

      const settledResult = {
        type: 'incomplete',
        value: undefined,
      } as MockSettledResult<Procedure>

      registerResult(result, state, prototypeState)
      registerSettledResult(settledResult, state, prototypeState)

      const context = new.target ? undefined : this
      const [instanceIndex, instancePrototypeIndex] = registerInstance(
        context,
        state,
        prototypeState
      )
      const [contextIndex, contextPrototypeIndex] = registerContext(
        context,
        state,
        prototypeState
      )

      const implementation: Procedure | Constructable =
        config.onceMockImplementations.shift() ||
        config.mockImplementation ||
        prototypeConfig?.onceMockImplementations.shift() ||
        prototypeConfig?.mockImplementation ||
        original ||
        noopImplementation

      let returnValue
      let thrownValue
      let didThrow = false

      try {
        if (new.target) {
          // the prototype chain is already prepared when the implementation
          // is registered, but a consumed `mockImplementationOnce` can change
          // which implementation this construction uses
          if (prototypeMembers.length === 0) {
            reparentMockPrototype(
              // oxlint-disable-next-line typescript/no-use-before-define
              mock,
              implementation === noopImplementation ? undefined : implementation
            )
          }
          returnValue = Reflect.construct(implementation, args, new.target)

          // jest calls this before the implementation, but we have to resolve this _after_
          // because we cannot do it before the `Reflect.construct` called the custom implementation.
          // fortunately, the constructor is always an empty function because `prototypeMethods`
          // are only used by the automocker, so this doesn't matter
          for (const prop of prototypeMembers) {
            const memberMock = returnValue[prop]
            // the method was overridden because of inheritance, ignore it
            // oxlint-disable-next-line typescript/no-use-before-define
            if (memberMock !== mock.prototype[prop]) {
              continue
            }

            const isMock = isMockFunction(memberMock)
            const memberState = isMock ? memberMock.mock : undefined
            const memberConfig = isMock
              ? MOCK_CONFIGS.get(memberMock)
              : undefined
            returnValue[prop] = createMockInstance({
              originalImplementation: keepMembersImplementation
                ? memberConfig?.mockOriginal
                : undefined,
              prototypeState: memberState,
              prototypeConfig: memberConfig,
              keepMembersImplementation,
            })
          }
        } else {
          returnValue = (implementation as Procedure).apply(this, args)
        }
      } catch (error: any) {
        thrownValue = error
        didThrow = true
        if (
          error instanceof TypeError &&
          error.message.includes('is not a constructor')
        ) {
          console.warn(
            `[vitest] The ${namedObject[name].getMockName()} mock did not use 'function' or 'class' in its implementation, see https://vitest.dev/api/vi#vi-spyon for examples.`
          )
        }
        throw error
      } finally {
        if (didThrow) {
          result.type = 'throw'
          result.value = thrownValue

          settledResult.type = 'rejected'
          settledResult.value = thrownValue
        } else {
          result.type = 'return'
          result.value = returnValue

          if (new.target) {
            state.contexts[contextIndex - 1] = returnValue
            state.instances[instanceIndex - 1] = returnValue

            if (contextPrototypeIndex != null && prototypeState) {
              prototypeState.contexts[contextPrototypeIndex - 1] = returnValue
            }
            if (instancePrototypeIndex != null && prototypeState) {
              prototypeState.instances[instancePrototypeIndex - 1] = returnValue
            }
          }

          if (returnValue instanceof Promise) {
            returnValue.then(
              (settledValue) => {
                settledResult.type = 'fulfilled'
                settledResult.value = settledValue
              },
              (rejectedValue) => {
                settledResult.type = 'rejected'
                settledResult.value = rejectedValue
              }
            )
          } else {
            settledResult.type = 'fulfilled'
            settledResult.value = returnValue
          }
        }
      }

      return returnValue
    } as Mock,
  }
  const mock = namedObject[name] as Mock<Procedure | Constructable>
  const copyPropertiesFrom = original || pseudoOriginal
  if (copyPropertiesFrom) {
    copyOriginalStaticProperties(mock, copyPropertiesFrom)
  }
  return mock
}

// puts the implementation's prototype behind `mock.prototype` so instances
// see prototype methods both during and after construction, while properties
// assigned on `mock.prototype` still shadow them
function reparentMockPrototype(
  mock: Mock<Procedure | Constructable>,
  implementation: Procedure | Constructable | undefined
) {
  const mockPrototype = mock.prototype
  if (mockPrototype == null) {
    return
  }
  // an implementation without a usable prototype (reset mock, arrow or bound
  // function) reverts the chain to `Object.prototype`, the parent every mock
  // is created with
  const parent =
    (implementation as Constructable | undefined)?.prototype ?? Object.prototype
  if (
    mockPrototype !== parent &&
    Object.getPrototypeOf(mockPrototype) !== parent
  ) {
    Object.setPrototypeOf(mockPrototype, parent)
  }
}

function registerCalls(
  args: unknown[],
  state: MockContext,
  prototypeState?: MockContext
) {
  state.calls.push(args)
  prototypeState?.calls.push(args)
}

function registerInvocationOrder(
  order: number,
  state: MockContext,
  prototypeState?: MockContext
) {
  state.invocationCallOrder.push(order)
  prototypeState?.invocationCallOrder.push(order)
}

function registerResult(
  result: MockResult<Procedure>,
  state: MockContext,
  prototypeState?: MockContext
) {
  state.results.push(result)
  prototypeState?.results.push(result)
}

function registerSettledResult(
  result: MockSettledResult<Procedure>,
  state: MockContext,
  prototypeState?: MockContext
) {
  state.settledResults.push(result)
  prototypeState?.settledResults.push(result)
}

function registerInstance(
  instance: MockReturnType<Procedure>,
  state: MockContext,
  prototypeState?: MockContext
) {
  const instanceIndex = state.instances.push(instance)
  const instancePrototypeIndex = prototypeState?.instances.push(instance)
  return [instanceIndex, instancePrototypeIndex] as const
}

function registerContext(
  context: MockProcedureContext<Procedure>,
  state: MockContext,
  prototypeState?: MockContext
) {
  const contextIndex = state.contexts.push(context)
  const contextPrototypeIndex = prototypeState?.contexts.push(context)
  return [contextIndex, contextPrototypeIndex] as const
}

function copyOriginalStaticProperties(
  mock: Mock<Procedure | Constructable>,
  original: Procedure | Constructable
) {
  const { properties, descriptors } = getAllProperties(original)

  for (const key of properties) {
    const descriptor = descriptors[key]!
    const mockDescriptor = getDescriptor(mock, key)
    if (mockDescriptor) {
      continue
    }

    Object.defineProperty(mock, key, descriptor)
  }
}

const ignoreProperties = new Set<string | symbol>([
  'length',
  'name',
  'prototype',
  Symbol.for('nodejs.util.promisify.custom'),
])

function getAllProperties(original: Procedure | Constructable) {
  const properties = new Set<string | symbol>()
  const descriptors: Record<string | symbol, PropertyDescriptor | undefined> =
    {}
  while (
    original &&
    original !== Object.prototype &&
    original !== Function.prototype
  ) {
    const ownProperties = [
      ...Object.getOwnPropertyNames(original),
      ...Object.getOwnPropertySymbols(original),
    ]
    for (const prop of ownProperties) {
      if (descriptors[prop] || ignoreProperties.has(prop)) {
        continue
      }
      properties.add(prop)
      descriptors[prop] = Object.getOwnPropertyDescriptor(original, prop)
    }
    original = Object.getPrototypeOf(original)
  }
  return {
    properties,
    descriptors,
  }
}

function getDefaultConfig(original?: Procedure | Constructable): MockConfig {
  return {
    mockImplementation: undefined,
    mockOriginal: original,
    mockName: 'vi.fn()',
    onceMockImplementations: [],
  }
}

function getDefaultState(): MockContext {
  const state = {
    calls: [],
    contexts: [],
    instances: [],
    invocationCallOrder: [],
    settledResults: [],
    results: [],
    get lastCall() {
      return state.calls.at(-1)
    },
  }
  return state
}

export function restoreAllMocks(): void {
  for (const restore of MOCK_RESTORE) {
    if (activeMockRestorationObservation) {
      observeMockRestoration(restore)
    } else {
      restore()
    }
  }
  MOCK_RESTORE.clear()
}

export function clearAllMocks(): void {
  forEachDirty(DIRTY_MOCK_STATES, (mock) => mock.mockClear())
}

export function resetAllMocks(): void {
  // `mockReset()` removes the mock from both sets, so a mock present in both
  // is visited once.
  forEachDirty(DIRTY_MOCK_STATES, (mock) => mock.mockReset())
  forEachDirty(DIRTY_MOCK_CONFIGS, (mock) => mock.mockReset())
}

function throwConstructorError(shorthand: string): never {
  throw new TypeError(
    `Cannot use \`${shorthand}\` when called with \`new\`. Use \`mockImplementation\` with a \`class\` keyword instead. See https://vitest.dev/api/mock#class-support for more information.`
  )
}

export type {
  Constructable,
  MaybeMocked,
  MaybeMockedConstructor,
  MaybeMockedDeep,
  MaybePartiallyMocked,
  MaybePartiallyMockedDeep,
  Mock,
  MockContext,
  Mocked,
  MockedClass,
  MockedFunction,
  MockedFunctionDeep,
  MockedObject,
  MockedObjectDeep,
  MockInstance,
  MockInstanceOption,
  MockParameters,
  MockProcedureContext,
  MockResult,
  MockResultIncomplete,
  MockResultReturn,
  MockResultThrow,
  MockReturnType,
  MockSettledResult,
  MockSettledResultFulfilled,
  MockSettledResultIncomplete,
  MockSettledResultRejected,
  PartiallyMockedFunction,
  PartiallyMockedFunctionDeep,
  PartialMock,
  Procedure,
} from './types'
