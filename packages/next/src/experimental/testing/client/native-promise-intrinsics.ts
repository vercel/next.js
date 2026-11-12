/** Data issued by the actual new-document initializer before authored modules. */
export const nativePromiseIntrinsicsKey =
  'next.test.engine-native-promise-intrinsics.v1'

export type ClientNativePromiseIntrinsics = Readonly<{
  constructor: PromiseConstructor
  resolve: PromiseConstructor['resolve']
  race?: PromiseConstructor['race']
  prototype: Promise<unknown>
  fetch?: typeof globalThis.fetch
  fetchRpc?: typeof globalThis.fetch
  json?: Response['json']
  readRpcJson?: Response['json']
  then?: typeof Promise.prototype.then
  apply?: typeof Reflect.apply
  reflect?: typeof Reflect
  hasRpcPromise?: (value: unknown) => boolean
  constructorDescriptor?: PropertyDescriptor
  speciesDescriptor?: PropertyDescriptor
  species?: symbol
  constructPromise?: (constructor: unknown, args: unknown[]) => unknown
  callFetch?: (callee: unknown, args: unknown[]) => unknown
}>

const own = Object.getOwnPropertyDescriptor
const captured = (() => {
  try {
    const record = own(
      globalThis,
      Symbol.for(nativePromiseIntrinsicsKey)
    )?.value
    if (!record || typeof record !== 'object') return undefined
    const classify = own(
      globalThis,
      Symbol.for('next.test.engine-promise-brand.v1')
    )?.value
    if (
      typeof classify !== 'function' ||
      own(record, 'classify')?.value !== classify
    )
      return undefined
    const constructor = own(record, 'constructor')?.value
    const resolve = own(record, 'resolve')?.value
    const race = own(record, 'race')?.value
    const prototype = own(record, 'prototype')?.value
    if (
      typeof constructor !== 'function' ||
      typeof resolve !== 'function' ||
      !prototype ||
      typeof prototype !== 'object'
    )
      return undefined
    const fetch = own(record, 'fetch')?.value
    const fetchRpc = own(record, 'fetchRpc')?.value
    const json = own(record, 'json')?.value
    const readRpcJson = own(record, 'readRpcJson')?.value
    const then = own(record, 'then')?.value
    const apply = own(record, 'apply')?.value
    const reflect = own(record, 'reflect')?.value
    const hasRpcPromise = own(record, 'hasRpcPromise')?.value
    const constructorDescriptor = own(record, 'constructorDescriptor')?.value
    const speciesDescriptor = own(record, 'speciesDescriptor')?.value
    const species = own(record, 'species')?.value
    const constructPromise = own(record, 'constructPromise')?.value
    const callFetch = own(record, 'callFetch')?.value
    return Object.freeze({
      constructor,
      resolve,
      ...(typeof race === 'function' ? { race } : {}),
      prototype,
      ...(typeof constructPromise === 'function' ? { constructPromise } : {}),
      ...(typeof callFetch === 'function' ? { callFetch } : {}),
      ...(typeof fetch === 'function' && typeof fetchRpc === 'function'
        ? { fetch, fetchRpc }
        : {}),
      ...(typeof json === 'function' && typeof readRpcJson === 'function'
        ? { json, readRpcJson }
        : {}),
      ...(typeof then === 'function' &&
      typeof apply === 'function' &&
      typeof hasRpcPromise === 'function' &&
      reflect &&
      constructorDescriptor &&
      speciesDescriptor &&
      typeof species === 'symbol'
        ? {
            then,
            apply,
            reflect,
            hasRpcPromise,
            constructorDescriptor,
            speciesDescriptor,
            species,
          }
        : {}),
    }) as ClientNativePromiseIntrinsics
  } catch {
    // Synthetic bootstrap objects keep the original unknown-value route.
    return undefined
  }
})()

export function getClientNativePromiseIntrinsics():
  | ClientNativePromiseIntrinsics
  | undefined {
  return captured
}
