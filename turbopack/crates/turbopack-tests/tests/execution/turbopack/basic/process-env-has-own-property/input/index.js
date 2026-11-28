import { env } from 'node:process'

const KEY = 'TURBOPACK_TEST_HAS_OWN_PROPERTY_KEY'

// Runs `fn` with `KEY` and `hasOwnProperty` unset, then restores their previous state
function withCleanEnv(fn) {
  const names = [KEY, 'hasOwnProperty']
  const saved = names.map((name) =>
    Object.hasOwn(process.env, name) ? { value: process.env[name] } : null
  )
  for (const name of names) delete process.env[name]
  try {
    fn()
  } finally {
    names.forEach((name, i) => {
      if (saved[i]) {
        process.env[name] = saved[i].value
      } else {
        delete process.env[name]
      }
    })
  }
}

it('should check env var existence at runtime', () => {
  withCleanEnv(() => {
    expect(
      process.env.hasOwnProperty('TURBOPACK_TEST_HAS_OWN_PROPERTY_KEY')
    ).toBe(false)
    expect(env.hasOwnProperty('TURBOPACK_TEST_HAS_OWN_PROPERTY_KEY')).toBe(
      false
    )

    process.env[KEY] = ''
    expect(
      process.env.hasOwnProperty('TURBOPACK_TEST_HAS_OWN_PROPERTY_KEY')
    ).toBe(true)
    expect(env.hasOwnProperty('TURBOPACK_TEST_HAS_OWN_PROPERTY_KEY')).toBe(true)
  })
})

it('should check env var existence with equivalent forms', () => {
  withCleanEnv(() => {
    const check = () => [
      Object.hasOwn(process.env, 'TURBOPACK_TEST_HAS_OWN_PROPERTY_KEY'),
      Object.prototype.hasOwnProperty.call(
        process.env,
        'TURBOPACK_TEST_HAS_OWN_PROPERTY_KEY'
      ),
      process.env.hasOwnProperty.call(
        env,
        'TURBOPACK_TEST_HAS_OWN_PROPERTY_KEY'
      ),
      process.env.propertyIsEnumerable('TURBOPACK_TEST_HAS_OWN_PROPERTY_KEY'),
    ]
    expect(check()).toEqual([false, false, false, false])
    process.env[KEY] = ''
    expect(check()).toEqual([true, true, true, true])
  })
})

it('should check env var existence with a dynamic key', () => {
  withCleanEnv(() => {
    // Not statically known to the analyzer
    const key = JSON.parse(JSON.stringify(KEY))
    expect(process.env.hasOwnProperty(key)).toBe(false)
    process.env[KEY] = '1'
    expect(process.env.hasOwnProperty(key)).toBe(true)
  })
})

it('should not constant-fold process.env.hasOwnProperty', () => {
  withCleanEnv(() => {
    // An env var called `hasOwnProperty` shadows the inherited method
    process.env.hasOwnProperty = ''
    expect(typeof process.env.hasOwnProperty).toBe('string')
    expect(process.env.hasOwnProperty ? 'truthy' : 'falsy').toBe('falsy')
    expect(!process.env.hasOwnProperty).toBe(true)
    expect(env.hasOwnProperty ? 'truthy' : 'falsy').toBe('falsy')

    delete process.env.hasOwnProperty
    expect(typeof process.env.hasOwnProperty).toBe('function')
    expect(process.env.hasOwnProperty ? 'truthy' : 'falsy').toBe('truthy')
  })
})

it('should not constant-fold Object.hasOwn feature checks', () => {
  // `Object.hasOwn` is missing in older runtimes
  const descriptor = Object.getOwnPropertyDescriptor(Object, 'hasOwn')
  delete Object.hasOwn
  try {
    expect(Object.hasOwn ? 'native' : 'fallback').toBe('fallback')
    expect(typeof (Object.hasOwn || null)).toBe('object')
  } finally {
    Object.defineProperty(Object, 'hasOwn', descriptor)
  }
  expect(Object.hasOwn ? 'native' : 'fallback').toBe('native')
})
