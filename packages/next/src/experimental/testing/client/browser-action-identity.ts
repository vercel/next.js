type ActionThen = (
  this: object,
  fulfilled: (value: unknown) => void,
  rejected: (reason: unknown) => void
) => unknown

/** Framework constructor data only; it carries no execution scope. */
export interface BrowserActionIdentity {
  readonly prototypes: readonly object[]
  readonly then: Readonly<PropertyDescriptor>
}

type BrowserAwaitableIdentity =
  | { kind: 'action'; identity: BrowserActionIdentity }
  | { kind: 'poll-facade' }

const actions = new WeakMap<object, BrowserAwaitableIdentity>()
const getPrototypeOf = Object.getPrototypeOf
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const ownKeys = Reflect.ownKeys
const defineProperty = Object.defineProperty

/** Called only by the private SDK constructors, never by authored code. */
export function registerBrowserActionIdentity(
  action: object,
  identity: BrowserActionIdentity
): void {
  actions.set(action, { kind: 'action', identity })
}

/** Publish a real ordinary poll facade, retaining its literal method data. */
export function createBrowserPollAwaitable<
  T extends {
    then: Function
    catch: Function
    finally: Function
    [Symbol.toStringTag]: string
  },
>(methods: T): T {
  const facade = {} as T
  // The literal argument has already evaluated the actual tag key. Preserve
  // its keys, descriptors and shorthand method objects without getter calls.
  for (const key of ownKeys(methods))
    defineProperty(facade, key, getOwnPropertyDescriptor(methods, key)!)
  actions.set(facade, { kind: 'poll-facade' })
  return facade
}

/** This fact grants no scope and never reads an authored then property. */
export function isBrowserPollAwaitable(value: unknown): boolean {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    actions.get(value)?.kind === 'poll-facade'
  )
}

function sameDescriptor(
  actual: PropertyDescriptor | undefined,
  expected: Readonly<PropertyDescriptor>
): boolean {
  return (
    actual !== undefined &&
    actual.value === expected.value &&
    actual.get === expected.get &&
    actual.set === expected.set &&
    actual.writable === expected.writable &&
    actual.enumerable === expected.enumerable &&
    actual.configurable === expected.configurable
  )
}

/** Inspect only ordinary registered objects; authored getters are never called. */
export function getBrowserActionThen(input: unknown): ActionThen | undefined {
  if (
    input === null ||
    (typeof input !== 'object' && typeof input !== 'function')
  )
    return undefined
  const record = actions.get(input)
  const identity = record?.kind === 'action' ? record.identity : undefined
  if (!identity || getOwnPropertyDescriptor(input, 'then')) return undefined
  let current: object = input
  for (let index = 0; index < identity.prototypes.length; index++) {
    const expected = identity.prototypes[index]
    if (getPrototypeOf(current) !== expected) return undefined
    const descriptor = getOwnPropertyDescriptor(expected, 'then')
    if (index === identity.prototypes.length - 1) {
      return sameDescriptor(descriptor, identity.then)
        ? (identity.then.value as ActionThen)
        : undefined
    }
    if (descriptor) return undefined
    current = expected
  }
  return undefined
}
