/// <reference path="./runtime-base.ts" />

// This file is concatenated only into the actual Node runtime, before any module factory.
const commonJsNativePromiseBrand = (
  require('node:util') as typeof import('node:util')
).types.isPromise
const commonJsNativePromiseConstructor = Promise
const commonJsNativePromiseGlobal = globalThis
const commonJsNativePromisePrototype =
  commonJsNativePromiseConstructor.prototype
const commonJsNativePromiseGetPrototypeOf = Object.getPrototypeOf
const commonJsNativePromiseCreate = Object.create
const commonJsNativePromiseDefineProperty = Object.defineProperty
const commonJsNativePromiseTag = Symbol.toStringTag
const commonJsNativePromiseGetOwnPropertyDescriptor =
  Object.getOwnPropertyDescriptor
const commonJsNativePromiseHasOwn = Object.hasOwn
const commonJsNativePromiseHasInstance = Symbol.hasInstance
const commonJsNativePromiseConstructorParent =
  commonJsNativePromiseGetPrototypeOf(commonJsNativePromiseConstructor)
const commonJsNativePromiseInheritedHasInstance =
  commonJsNativePromiseGetOwnPropertyDescriptor(
    commonJsNativePromiseConstructorParent,
    commonJsNativePromiseHasInstance
  )

function prepareNodeCommonJsPublication(
  this: TurbopackBaseContext<Module>,
  interopDefault: boolean,
  nativePromise?: true
): (() => void) | undefined {
  if (nativePromise !== true) {
    return prepareCommonJsPublication.call(this, interopDefault)
  }
  const module = this.m
  if (module.namespaceObject !== undefined) return
  return () => {
    // A real cycle consumer's independently created partial namespace wins.
    if (module.namespaceObject !== undefined) return
    // The reference's live instanceof lookup can execute authored getters/methods.
    // Keep changed constructors on the existing consumer path without reading them.
    const constructor = commonJsNativePromiseGetOwnPropertyDescriptor(
      commonJsNativePromiseGlobal,
      'Promise'
    )
    const inherited = commonJsNativePromiseGetOwnPropertyDescriptor(
      commonJsNativePromiseConstructorParent,
      commonJsNativePromiseHasInstance
    )
    if (
      !constructor ||
      !commonJsNativePromiseHasOwn(constructor, 'value') ||
      constructor.value !== commonJsNativePromiseConstructor ||
      commonJsNativePromiseGetPrototypeOf(commonJsNativePromiseConstructor) !==
        commonJsNativePromiseConstructorParent ||
      commonJsNativePromiseGetOwnPropertyDescriptor(
        commonJsNativePromiseConstructor,
        commonJsNativePromiseHasInstance
      ) !== undefined ||
      !inherited ||
      !commonJsNativePromiseInheritedHasInstance ||
      !commonJsNativePromiseHasOwn(inherited, 'value') ||
      !commonJsNativePromiseHasOwn(
        commonJsNativePromiseInheritedHasInstance,
        'value'
      ) ||
      inherited.value !== commonJsNativePromiseInheritedHasInstance.value ||
      inherited.writable !==
        commonJsNativePromiseInheritedHasInstance.writable ||
      inherited.enumerable !==
        commonJsNativePromiseInheritedHasInstance.enumerable ||
      inherited.configurable !==
        commonJsNativePromiseInheritedHasInstance.configurable
    )
      return
    const raw = module.exports
    // Only the captured ordinary same-realm native Promise profile is admitted here.
    // Native brand inspection excludes proxies without invoking any authored traps.
    if (
      !commonJsNativePromiseBrand(raw) ||
      commonJsNativePromiseGetPrototypeOf(raw) !==
        commonJsNativePromisePrototype
    )
      return
    const namespace = commonJsNativePromiseCreate(null)
    commonJsNativePromiseDefineProperty(namespace, 'default', {
      value: raw,
      writable: true,
      enumerable: true,
      configurable: true,
    })
    commonJsNativePromiseDefineProperty(namespace, commonJsNativePromiseTag, {
      value: 'Module',
    })
    module.namespaceObject = namespace
    commonJsNativePromiseDefineProperty(module, 'commonJsNamespacePublished', {
      value: true,
      configurable: true,
    })
  }
}
contextPrototype.p = prepareNodeCommonJsPublication
