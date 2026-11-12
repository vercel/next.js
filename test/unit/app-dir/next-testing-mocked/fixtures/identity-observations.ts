/** Portable observations; this helper invokes no assertion or test API. */
export function observeMocked(helper: Function) {
  const object = { value: 1 }
  const array = [1]
  const original = (value: number) => value + 1
  const instance = new (class Item {})()
  const primitives = [
    undefined,
    null,
    false,
    true,
    0,
    -0,
    NaN,
    1n,
    '',
    Symbol('item'),
    object,
    array,
    original,
    instance,
  ]
  const identities = primitives.map((item) =>
    Object.is(Reflect.apply(helper, undefined, [item]), item)
  )
  const forms = [
    [],
    [undefined],
    [false],
    [true],
    [{}],
    [{ partial: false }],
    [{ deep: false }],
    [{ deep: true }],
    [{ partial: false, deep: false }],
    [{ partial: false, deep: true }],
    [{ partial: true }],
    [{ partial: true, deep: false }],
    [{ partial: true, deep: true }],
    [null],
    [17],
    [{ extra: 'ignored' }],
  ]
  const optionIdentities = forms.map((args) =>
    Object.is(Reflect.apply(helper, undefined, [object, ...args]), object)
  )
  const extraArgumentsIgnored = Object.is(
    Reflect.apply(helper, undefined, [object, undefined, 'extra']),
    object
  )

  const observations: { same: boolean; traps: number; error: string | null }[] =
    []
  function record(item: unknown, options: unknown, count: () => number) {
    let same = false
    let error: string | null = null
    try {
      const result = Reflect.apply(helper, undefined, [item, options])
      same = Object.is(result, item)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'non-Error failure'
    }
    // Read only the controlled count, never the item/options, before a caller
    // can render assertion diagnostics. Returned data contains primitives only.
    const traps = count()
    observations.push({ same, traps, error })
  }
  let traps = 0
  const fail = () => {
    traps++
    throw new Error('unexpected user observation')
  }
  const handler: ProxyHandler<object> = {
    get: fail,
    set: fail,
    has: fail,
    ownKeys: fail,
    getOwnPropertyDescriptor: fail,
    defineProperty: fail,
    deleteProperty: fail,
    getPrototypeOf: fail,
    setPrototypeOf: fail,
    isExtensible: fail,
    preventExtensions: fail,
    apply: fail,
    construct: fail,
  }
  record(new Proxy({}, handler), undefined, () => traps)
  traps = 0
  record(new Proxy(original, handler), undefined, () => traps)
  traps = 0
  const getterItem = Object.defineProperty({}, 'value', { get: fail })
  record(getterItem, undefined, () => traps)
  traps = 0
  record(object, new Proxy({}, handler), () => traps)
  const revokedItem = Proxy.revocable({}, {})
  revokedItem.revoke()
  record(revokedItem.proxy, undefined, () => 0)
  const revokedOptions = Proxy.revocable({}, {})
  revokedOptions.revoke()
  record(object, revokedOptions.proxy, () => 0)
  const revokedReceiver = Proxy.revocable({}, {})
  revokedReceiver.revoke()
  const foreignReceiverIgnored = Object.is(
    Reflect.apply(helper, revokedReceiver.proxy, [
      object,
      revokedOptions.proxy,
    ]),
    object
  )
  let nonconstructable = false
  try {
    Reflect.construct(helper, [])
  } catch (error) {
    nonconstructable = error instanceof TypeError
  }
  return {
    primitiveRows: identities.length,
    identities,
    optionRows: optionIdentities.length,
    optionIdentities,
    extraArgumentsIgnored,
    observations,
    foreignReceiverIgnored,
    nonconstructable,
    name: helper.name,
    length: helper.length,
    originalIsStillOrdinary: !Object.hasOwn(original, 'mock'),
  }
}
