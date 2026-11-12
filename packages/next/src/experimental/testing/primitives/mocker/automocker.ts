type Key = string | symbol

export type CreateMockInstanceProcedure = (options?: {
  prototypeMembers?: (string | symbol)[]
  name?: string | symbol
  originalImplementation?: (...args: any[]) => any
  keepMembersImplementation?: boolean
}) => any

export interface MockObjectOptions {
  type: 'automock' | 'autospy'
  globalConstructors: GlobalConstructors
  createMockInstance: CreateMockInstanceProcedure
}

export function mockObject(
  options: MockObjectOptions,
  object: Record<Key, any>,
  mockExports: Record<Key, any> = {}
): Record<Key, any> {
  const finalizers = new Array<() => void>()
  const refs = new RefTracker()

  const define = (container: Record<Key, any>, key: Key, value: any) => {
    try {
      container[key] = value
      return true
    } catch {
      return false
    }
  }

  const createMock = (currentValue: (...args: any[]) => any) => {
    if (!options.createMockInstance) {
      throw new Error(
        '[@vitest/mocker] `createMockInstance` is not defined. This is a Vitest error. Please open a new issue with reproduction.'
      )
    }
    const createMockInstance = options.createMockInstance
    const prototypeMembers = currentValue.prototype
      ? collectFunctionProperties(currentValue.prototype)
      : []
    return createMockInstance({
      name: currentValue.name,
      prototypeMembers,
      originalImplementation:
        options.type === 'autospy' ? currentValue : undefined,
      keepMembersImplementation: options.type === 'autospy',
    })
  }

  const mockPropertiesOf = (
    container: Record<Key, any>,
    newContainer: Record<Key, any>
  ) => {
    const containerType = getType(container)
    const isModule = containerType === 'Module' || !!container.__esModule
    for (const { key: property, descriptor } of getAllMockableProperties(
      container,
      isModule,
      options.globalConstructors
    )) {
      // Modules define their exports as getters. We want to process those.
      if (!isModule && descriptor.get) {
        try {
          if (options.type === 'autospy') {
            Object.defineProperty(newContainer, property, descriptor)
          } else {
            Object.defineProperty(newContainer, property, {
              configurable: descriptor.configurable,
              enumerable: descriptor.enumerable,
              // automatically mock getters and setters
              // https://github.com/vitest-dev/vitest/issues/8345
              get: () => {},
              set: descriptor.set ? () => {} : undefined,
            })
          }
        } catch {
          // Ignore errors, just move on to the next prop.
        }
        continue
      }

      // Skip special read-only props, we don't want to mess with those.
      if (isReadonlyProp(container[property], property)) {
        continue
      }

      const value = container[property]

      // Special handling of references we've seen before to prevent infinite
      // recursion in circular objects.
      const refId = refs.getId(value)
      if (refId !== undefined) {
        finalizers.push(() =>
          define(newContainer, property, refs.getMockedValue(refId))
        )
        continue
      }

      const type = getType(value)

      if (Array.isArray(value)) {
        if (options.type === 'automock') {
          define(newContainer, property, [])
        } else {
          const array = value.map((item) => {
            if (item && typeof item === 'object') {
              const newObject = {}
              mockPropertiesOf(item, newObject)
              return newObject
            }
            if (typeof item === 'function') {
              return createMock(item)
            }
            return item
          })
          define(newContainer, property, array)
        }
        continue
      }

      const isFunction =
        type.includes('Function') && typeof value === 'function'
      if (
        (!isFunction || value._isMockFunction) &&
        type !== 'Object' &&
        type !== 'Module'
      ) {
        define(newContainer, property, value)
        continue
      }

      if (options.type === 'autospy' && type === 'Module') {
        // Replace with clean object to recursively autospy exported module objects:
        //   export * as ns from "./ns"
        // or
        //   import * as ns from "./ns"
        //   export { ns }
        const exports = Object.create(null)
        Object.defineProperty(exports, Symbol.toStringTag, {
          value: 'Module',
          configurable: true,
          writable: true,
        })
        try {
          newContainer[property] = exports
        } catch {
          continue
        }
      }
      // Sometimes this assignment fails for some unknown reason. If it does,
      // just move along.
      else if (
        !define(
          newContainer,
          property,
          isFunction || options.type === 'autospy' ? value : {}
        )
      ) {
        continue
      }

      if (isFunction) {
        const mock = createMock(newContainer[property])
        newContainer[property] = mock
      }

      refs.track(value, newContainer[property])
      mockPropertiesOf(value, newContainer[property])
    }
  }

  const mockedObject: Record<Key, any> = mockExports
  mockPropertiesOf(object, mockedObject)

  // Plug together refs
  for (const finalizer of finalizers) {
    finalizer()
  }

  return mockedObject
}

class RefTracker {
  private idMap = new Map<any, number>()
  private mockedValueMap = new Map<number, any>()

  public getId(value: any) {
    return this.idMap.get(value)
  }

  public getMockedValue(id: number) {
    return this.mockedValueMap.get(id)
  }

  public track(originalValue: any, mockedValue: any): number {
    const newId = this.idMap.size
    this.idMap.set(originalValue, newId)
    this.mockedValueMap.set(newId, mockedValue)
    return newId
  }
}

function getType(value: unknown): string {
  return Object.prototype.toString.apply(value).slice(8, -1)
}

function isReadonlyProp(object: unknown, prop: string | symbol) {
  if (
    prop === 'arguments' ||
    prop === 'caller' ||
    prop === 'callee' ||
    prop === 'name' ||
    prop === 'length'
  ) {
    const typeName = getType(object)
    return (
      typeName === 'Function' ||
      typeName === 'AsyncFunction' ||
      typeName === 'GeneratorFunction' ||
      typeName === 'AsyncGeneratorFunction'
    )
  }

  if (
    prop === 'source' ||
    prop === 'global' ||
    prop === 'ignoreCase' ||
    prop === 'multiline'
  ) {
    return getType(object) === 'RegExp'
  }

  return false
}

export interface GlobalConstructors {
  Object: ObjectConstructor
  Function: FunctionConstructor
  RegExp: RegExpConstructor
  Array: ArrayConstructor
  Map: MapConstructor
}

function getAllMockableProperties(
  obj: any,
  isModule: boolean,
  constructors: GlobalConstructors
) {
  const { Map, Object, Function, RegExp, Array } = constructors

  const allProps = new Map<
    string | symbol,
    { key: string | symbol; descriptor: PropertyDescriptor }
  >()
  let curr = obj
  do {
    // we don't need properties from these
    if (
      curr === Object.prototype ||
      curr === Function.prototype ||
      curr === RegExp.prototype
    ) {
      break
    }

    const currentObject = curr
    collectOwnProperties(currentObject, (key) => {
      const descriptor = Object.getOwnPropertyDescriptor(currentObject, key)
      if (descriptor) {
        allProps.set(key, { key, descriptor })
      }
    })
    // oxlint-disable-next-line no-cond-assign
  } while ((curr = Object.getPrototypeOf(curr)))
  // default is not specified in ownKeys, if module is interoped
  if (isModule && !allProps.has('default') && 'default' in obj) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, 'default')
    if (descriptor) {
      allProps.set('default', { key: 'default', descriptor })
    }
  }
  return Array.from(allProps.values())
}

function collectOwnProperties(
  obj: any,
  collector: Set<string | symbol> | ((key: string | symbol) => void)
) {
  const collect =
    typeof collector === 'function'
      ? collector
      : (key: string | symbol) => collector.add(key)
  Object.getOwnPropertyNames(obj).forEach(collect)
  Object.getOwnPropertySymbols(obj).forEach(collect)
}

function collectFunctionProperties(prototype: any) {
  const properties = new Set<string | symbol>()
  collectOwnProperties(prototype, (prop) => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, prop)
    if (!descriptor || descriptor.get) {
      return
    }
    const type = getType(descriptor.value)
    if (type.includes('Function') && !isReadonlyProp(descriptor.value, prop)) {
      properties.add(prop)
    }
  })
  return Array.from(properties)
}
