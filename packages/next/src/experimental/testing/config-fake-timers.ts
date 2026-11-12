import { types } from 'node:util'

type ConfigRecord = Record<string, unknown>
const isProxy = types.isProxy
const getPrototypeOf = Object.getPrototypeOf
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const create = Object.create
const ownKeys = Reflect.ownKeys
const objectPrototype = Object.prototype

function container(value: unknown): value is ConfigRecord {
  if (value === null || typeof value !== 'object' || isProxy(value))
    return false
  const prototype = getPrototypeOf(value)
  if (prototype !== null && prototype !== objectPrototype) return false
  if (
    getOwnPropertyDescriptor(value, 'constructor') ||
    getOwnPropertyDescriptor(value, 'prototype') ||
    getOwnPropertyDescriptor(value, '__proto__') ||
    getOwnPropertyDescriptor(value, Symbol.toStringTag)
  )
    return false
  const constructor = getOwnPropertyDescriptor(objectPrototype, 'constructor')
  return (
    !!constructor &&
    'value' in constructor &&
    constructor.value === Object &&
    !getOwnPropertyDescriptor(objectPrototype, Symbol.toStringTag)
  )
}
function data(value: ConfigRecord, key: string) {
  const descriptor = getOwnPropertyDescriptor(value, key)
  return descriptor && 'value' in descriptor ? descriptor : undefined
}

// Literal Vitest 5.0.4 deepMerge semantics: classification and assignment are
// separate real reads, and plain objects recurse while arrays remain values.
function mergeable(value: unknown): value is ConfigRecord {
  const item = value as { constructor?: { name?: string } | null }
  return (
    Object.prototype.toString.call(value) === '[object Object]' &&
    (!item.constructor || item.constructor.name === 'Object') &&
    !Array.isArray(value)
  )
}
function copy(target: ConfigRecord, ...sources: unknown[]): ConfigRecord {
  if (!sources.length) return target
  const source = sources.shift()
  if (source === undefined) return target
  if (mergeable(target) && mergeable(source))
    Object.keys(source).forEach((key) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype')
        return
      if (mergeable(source[key])) {
        if (!target[key]) target[key] = {}
        copy(target[key] as ConfigRecord, source[key])
      } else target[key] = source[key]
    })
  return copy(target, ...sources)
}

function ownDataRecord(value: ConfigRecord): boolean {
  const descriptors = getOwnPropertyDescriptors(value)
  const keys = ownKeys(descriptors)
  for (let index = 0; index < keys.length; index++)
    if (!('value' in descriptors[keys[index] as keyof typeof descriptors]))
      return false
  return true
}
function project(owner: ConfigRecord, key: string, value: unknown) {
  const descriptors = getOwnPropertyDescriptors(owner)
  descriptors[key] = { ...descriptors[key], value }
  return create(getPrototypeOf(owner), descriptors) as ConfigRecord
}
function unset(value: ConfigRecord, key: string) {
  const descriptor = getOwnPropertyDescriptor(value, key)
  return (
    !descriptor || ('value' in descriptor && descriptor.value === undefined)
  )
}
function selected(value: ConfigRecord, key: string, expected: unknown) {
  const descriptor = getOwnPropertyDescriptor(value, key)
  return (
    !descriptor ||
    ('value' in descriptor &&
      (descriptor.value === undefined || descriptor.value === expected))
  )
}

/** Copy only the measured root ordinary-Node own-now-accessor configuration. */
export function prepareProjectFakeTimers(
  value: unknown,
  projectConfig = false
): unknown {
  if (projectConfig === true || !container(value)) return value
  const testDescriptor = data(value, 'test')
  if (!testDescriptor?.enumerable || !container(testDescriptor.value))
    return value
  const test = testDescriptor.value
  if (
    !unset(test, 'projects') ||
    !unset(test, 'browser') ||
    !unset(test, 'route') ||
    !unset(test, 'typecheck') ||
    getOwnPropertyDescriptor(test, 'pool') ||
    !selected(test, 'environment', 'node') ||
    !selected(test, 'isolate', true)
  )
    return value
  const timerDescriptor = data(test, 'fakeTimers')
  if (!timerDescriptor?.enumerable || !container(timerDescriptor.value))
    return value
  const now = getOwnPropertyDescriptor(timerDescriptor.value, 'now')
  if (!now?.enumerable || typeof now.get !== 'function') return value
  if (!ownDataRecord(value) || !ownDataRecord(test)) return value
  const timers = copy({}, timerDescriptor.value)
  return project(value, 'test', project(test, 'fakeTimers', timers))
}
