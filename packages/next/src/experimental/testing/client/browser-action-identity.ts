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

const actions = new WeakMap<object, BrowserActionIdentity>()
const getPrototypeOf = Object.getPrototypeOf
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor

/** Called only by the private SDK constructors, never by authored code. */
export function registerBrowserActionIdentity(
  action: object,
  identity: BrowserActionIdentity
): void {
  actions.set(action, identity)
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
  const identity = actions.get(input)
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
