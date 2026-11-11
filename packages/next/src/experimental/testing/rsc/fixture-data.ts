import { types } from 'node:util'

/** Only this data subset crosses the private browser fixture transport. */
export type FixtureData =
  | null
  | boolean
  | number
  | string
  | FixtureData[]
  | { [key: string]: FixtureData }

/**
 * Validate before serialization, so JSON.stringify cannot silently drop values
 * or invoke a toJSON/getter supplied by the driver. React's own Flight serializer
 * still validates values produced inside the compiled server fixture.
 */
export function validateFixtureProps(
  props: unknown
): asserts props is Record<string, FixtureData> {
  const ancestors = new Set<object>()

  function visit(value: unknown, depth: number): void {
    if (depth > 100) {
      throw new Error('Registered fixture props exceed the maximum data depth.')
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    ) {
      return
    }
    if (typeof value === 'number' && Number.isFinite(value)) return
    if (typeof value !== 'object' || value === null) {
      throw new Error('Registered fixture props must contain only JSON data.')
    }
    // Driver inputs are live values before JSON.stringify. Reflection alone
    // cannot validate proxies: their traps can change data after admission.
    if (types.isProxy(value)) {
      throw new Error('Registered fixture props must not contain proxies.')
    }
    if (ancestors.has(value)) {
      throw new Error('Registered fixture props must not contain cycles.')
    }
    const array = Array.isArray(value)
    if (array && Object.getPrototypeOf(value) !== Array.prototype) {
      throw new Error(
        'Registered fixture props must contain only plain arrays.'
      )
    }
    if (
      !array &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    ) {
      throw new Error(
        'Registered fixture props must contain only plain objects.'
      )
    }
    ancestors.add(value)
    try {
      const keys = Reflect.ownKeys(value)
      if (array && keys.length !== value.length + 1) {
        throw new Error(
          'Registered fixture props must contain dense arrays without extra properties.'
        )
      }
      for (const key of keys) {
        if (array && key === 'length') continue
        if (typeof key !== 'string') {
          throw new Error(
            'Registered fixture props must not contain symbol keys.'
          )
        }
        // React copies configuration into a plain props object. Do not allow
        // JSON data to invoke its inherited prototype setter during that copy.
        if (key === '__proto__') {
          throw new Error(
            'Registered fixture props must not contain __proto__ keys.'
          )
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!
        if (!descriptor.enumerable || !('value' in descriptor)) {
          throw new Error(
            'Registered fixture props must contain only enumerable data properties.'
          )
        }
        if (
          array &&
          (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)
        ) {
          throw new Error(
            'Registered fixture props must contain dense arrays without extra properties.'
          )
        }
        visit(descriptor.value, depth + 1)
      }
    } finally {
      ancestors.delete(value)
    }
  }

  if (props === null || typeof props !== 'object' || Array.isArray(props)) {
    throw new Error('Registered fixture props must be a plain object.')
  }
  visit(props, 0)
}
