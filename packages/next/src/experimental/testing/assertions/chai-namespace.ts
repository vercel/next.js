import { getAssertionRuntimeForAssertions as getAssertionRuntime } from '../runner'
import type { chai as PrimitiveChai } from '../../../compiled/next-test-primitives'

type ChaiNamespace = typeof PrimitiveChai
type Plugin = Parameters<ChaiNamespace['use']>[0]
const pluginDelegates = new WeakMap<Plugin, Plugin>()
const namespacePrototypes = new WeakMap<object, object>()
export function getChaiNamespacePrototype(namespace: object) {
  const prototype = namespacePrototypes.get(namespace)
  if (!prototype) throw new Error('Unrecognized Chai namespace')
  return prototype
}

const pluginFrames: { plugin: Plugin; exports: ChaiNamespace }[] = []

// Stable API dispatchers have no assertion owner. Actual assertions/callback
// receivers are admitted by the original runner and retain their exact scope.
export function createChaiNamespace(
  assert: ChaiNamespace['assert'],
  should: ChaiNamespace['should']
): ChaiNamespace {
  const unsupported = (): never => {
    throw new Error(
      'This Chai reflection API is not yet supported by Next testing'
    )
  }
  let namespace: ChaiNamespace
  const prototype = new Proxy(Object.create(null), {
    get(_target, key) {
      if (key === 'constructor') return Assertion
      return getAssertionRuntime().readChaiPrototype(key, prototype)
    },
    getOwnPropertyDescriptor() {
      getAssertionRuntime().assertChaiNamespaceAccess()
      return unsupported()
    },
    getPrototypeOf() {
      getAssertionRuntime().assertChaiNamespaceAccess()
      return null
    },
    defineProperty() {
      getAssertionRuntime().assertChaiNamespaceAccess()
      return unsupported()
    },
    set() {
      getAssertionRuntime().assertChaiNamespaceAccess()
      return unsupported()
    },
  })
  function Assertion(...args: unknown[]) {
    if (new.target && new.target !== Assertion) return unsupported()
    return getAssertionRuntime().constructChaiNamespaceAssertion(
      args,
      prototype
    )
  }
  Object.defineProperty(Assertion, 'prototype', { value: prototype })
  Object.defineProperty(Assertion, Symbol.hasInstance, {
    value(value: unknown) {
      return getAssertionRuntime().isChaiNamespaceAssertion(value)
    },
  })
  function rawExpect(...args: unknown[]) {
    return getAssertionRuntime().createChaiNamespaceAssertion(args, prototype)
  }
  Object.defineProperty(rawExpect, 'name', {
    value: 'expect',
    configurable: true,
  })
  Object.defineProperty(Assertion, 'name', {
    value: 'Assertion',
    configurable: true,
  })
  Object.defineProperty(rawExpect, 'fail', {
    value(...args: unknown[]) {
      return getAssertionRuntime().callChaiExpectFail(args)
    },
  })
  for (const key of ['includeStack', 'showDiff'] as const) {
    Object.defineProperty(Assertion, key, {
      configurable: true,
      get() {
        return getAssertionRuntime().readChaiConfig(key, true)
      },
      set(value: unknown) {
        getAssertionRuntime().writeChaiConfig(key, value, true)
      },
    })
  }
  const registration = new Set([
    'addMethod',
    'addProperty',
    'addChainableMethod',
    'overwriteMethod',
    'overwriteProperty',
    'overwriteChainableMethod',
  ])
  const utilities = new Map<PropertyKey, Function>()
  const util: ChaiNamespace['util'] = new Proxy(Object.create(null), {
    get(_target, key) {
      getAssertionRuntime().assertChaiNamespaceAccess()
      if (key === 'events') return getAssertionRuntime().chaiEvents()
      if (key === 'checkError') return checkError
      if (
        typeof key !== 'string' ||
        !getAssertionRuntime().chaiUtilityKeys().includes(key)
      )
        return undefined
      let method = utilities.get(key)
      if (!method) {
        method = (...args: unknown[]) => {
          const runtime = getAssertionRuntime()
          if (registration.has(key)) {
            if (args[0] !== prototype) return unsupported()
            return runtime.registerChaiAssertionMember(
              key,
              args.slice(1),
              prototype
            )
          }
          return runtime.callChaiUtility(key, args, prototype)
        }
        utilities.set(key, method)
      }
      return method
    },
    ownKeys() {
      return getAssertionRuntime().chaiUtilityKeys()
    },
    getOwnPropertyDescriptor(_target, key) {
      return {
        configurable: true,
        enumerable: true,
        value: Reflect.get(util, key),
      }
    },
    getPrototypeOf: () => null,
  })
  const checkErrorMethods = new Map<PropertyKey, Function>()
  const checkError = new Proxy(Object.create(null), {
    get(_target, key) {
      getAssertionRuntime().assertChaiNamespaceAccess()
      if (
        ![
          'compatibleConstructor',
          'compatibleInstance',
          'compatibleMessage',
          'getConstructorName',
          'getMessage',
        ].includes(String(key))
      )
        return undefined
      let method = checkErrorMethods.get(key)
      if (!method) {
        method = (...args: unknown[]) =>
          getAssertionRuntime().callChaiCheckError(key, args)
        checkErrorMethods.set(key, method)
      }
      return method
    },
    getPrototypeOf: () => null,
  })
  for (const key of registration) {
    Object.defineProperty(Assertion, key, {
      value: (...args: unknown[]) => Reflect.get(util, key)(prototype, ...args),
    })
  }
  const config: ChaiNamespace['config'] = new Proxy(Object.create(null), {
    get(_target, key) {
      return getAssertionRuntime().readChaiConfig(key)
    },
    set(_target, key, value) {
      return getAssertionRuntime().writeChaiConfig(key, value)
    },
    ownKeys() {
      return getAssertionRuntime().chaiConfigKeys()
    },
    getOwnPropertyDescriptor(_target, key) {
      return {
        configurable: true,
        enumerable: true,
        value: Reflect.get(config, key),
        writable: true,
      }
    },
    getPrototypeOf: () => null,
  })
  function exportsRecord() {
    return {
      use,
      AssertionError: getAssertionRuntime().chaiAssertionError(),
      util,
      config,
      expect: rawExpect,
      assert,
      Assertion,
      should,
      Should: should,
    } as unknown as ChaiNamespace
  }
  function use(plugin: Plugin) {
    getAssertionRuntime().assertChaiNamespaceAccess()
    if (typeof plugin !== 'function')
      throw new TypeError('Chai plugin must be a function')
    const exports = exportsRecord()
    let delegate = pluginDelegates.get(plugin)
    if (!delegate) {
      delegate = () => {
        const frame = pluginFrames[pluginFrames.length - 1]
        if (!frame || frame.plugin !== plugin)
          throw new Error('Missing original Chai plugin invocation')
        Reflect.apply(plugin, undefined, [frame.exports, util])
      }
      pluginDelegates.set(plugin, delegate)
    }
    pluginFrames.push({ plugin, exports })
    try {
      getAssertionRuntime().useChaiPlugin(delegate)
    } finally {
      pluginFrames.pop()
    }
    return exports
  }
  namespace = Object.create(null)
  for (const key of [
    'Assertion',
    'AssertionError',
    'Should',
    'assert',
    'config',
    'expect',
    'should',
    'use',
    'util',
  ]) {
    Object.defineProperty(namespace, key, {
      enumerable: true,
      configurable: true,
      get: () => Reflect.get(exportsRecord(), key),
    })
  }
  namespacePrototypes.set(namespace, prototype)
  return namespace
}
