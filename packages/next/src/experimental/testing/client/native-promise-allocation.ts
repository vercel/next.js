import { getClientNativePromiseIntrinsics } from './native-promise-intrinsics'

const intrinsics = getClientNativePromiseIntrinsics()
const receipts = intrinsics ? new WeakSet<object>() : undefined
const addReceipt = receipts?.add.bind(receipts)
const hasReceipt = receipts?.has.bind(receipts)
const getPrototypeOf = intrinsics ? Object.getPrototypeOf : undefined
// Race emulates native member/Call operations without authored global helpers.
const raceProxy = Proxy
const raceGet = Reflect.get
const raceApply = Reflect.apply

/** Receipt issuance follows this actual construction, never a supplied value. */
export function createClientNativePromise<T>(
  Constructor: PromiseConstructor,
  executor: ConstructorParameters<typeof Promise<T>>[0]
): Promise<T> {
  const promise = new Constructor<T>(executor)
  if (Constructor === intrinsics?.constructor) addReceipt!(promise)
  return promise
}

/** No execution owner is stored; the actual current prototype selects 1 or 2. */
export function knownClientNativePromiseRoute(
  value: unknown
): 1 | 2 | undefined {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function') ||
    !hasReceipt?.(value)
  )
    return undefined
  return getPrototypeOf!(value) === intrinsics!.prototype ? 1 : 2
}

const own = intrinsics ? Object.getOwnPropertyDescriptor : undefined
const globalObject = intrinsics ? globalThis : undefined

function sameDescriptor(
  actual: PropertyDescriptor | undefined,
  expected: PropertyDescriptor
): boolean {
  return (
    !!actual &&
    actual.value === expected.value &&
    actual.get === expected.get &&
    actual.set === expected.set &&
    actual.writable === expected.writable &&
    actual.enumerable === expected.enumerable &&
    actual.configurable === expected.configurable
  )
}

/** Capture only a real native data-method selection, before callback arguments. */
export function captureClientNativeThen(
  selectedThen: typeof Promise.prototype.then,
  receiver: unknown
): ((fulfilled: unknown, rejected: unknown) => unknown) | undefined {
  if (
    !intrinsics?.then ||
    !intrinsics.apply ||
    !intrinsics.reflect ||
    !intrinsics.hasRpcPromise ||
    !intrinsics.constructorDescriptor ||
    !intrinsics.speciesDescriptor ||
    !intrinsics.species ||
    selectedThen !== intrinsics.then ||
    !receiver ||
    (typeof receiver !== 'object' && typeof receiver !== 'function') ||
    !(hasReceipt?.(receiver) || intrinsics.hasRpcPromise(receiver))
  )
    return undefined
  const globalReflect = own!(globalObject, 'Reflect')
  if (!globalReflect || globalReflect.value !== intrinsics.reflect)
    return undefined
  const apply = own!(intrinsics.reflect, 'apply')
  if (
    !apply ||
    apply.value !== intrinsics.apply ||
    apply.get ||
    apply.set ||
    apply.writable !== true ||
    apply.configurable !== true ||
    apply.enumerable !== false
  )
    return undefined
  const selectedApply = intrinsics.apply
  return (fulfilled, rejected) => {
    // The actual selected callee is retained while callback arguments evaluate.
    const qualifies =
      getPrototypeOf!(receiver) === intrinsics.prototype &&
      !own!(receiver, 'constructor') &&
      sameDescriptor(
        own!(intrinsics.prototype, 'constructor'),
        intrinsics.constructorDescriptor!
      ) &&
      sameDescriptor(
        own!(intrinsics.constructor, intrinsics.species!),
        intrinsics.speciesDescriptor!
      )
    const result = selectedApply(selectedThen, receiver, [fulfilled, rejected])
    if (qualifies) addReceipt!(result)
    return result
  }
}

/** Select the real static member before its original argument expressions. */
export function bindClientNativePromiseRace(
  receiver: any
): (...args: any[]) => any {
  const callee = receiver.race
  return function (...args: unknown[]): unknown {
    if (
      !intrinsics?.race ||
      receiver !== intrinsics.constructor ||
      callee !== intrinsics.race
    )
      return raceApply(callee, receiver, args)
    // Native race still owns capability creation, resolver lookup, iteration
    // and abrupt completion. Only its actual constructor allocates a receipt.
    const constructor = new raceProxy(receiver, {
      construct(target, values) {
        return createClientNativePromise(target, values[0])
      },
      get(target, property) {
        const value = raceGet(target, property, target)
        if (property !== 'resolve' || typeof value !== 'function') return value
        return function (input: unknown) {
          return raceApply(value, target, [input])
        }
      },
    })
    return raceApply(callee, constructor, args)
  }
}
