import { env } from 'node:process'

const KEY = 'TURBOPACK_TEST_HAS_OWN_PROPERTY_KEY'

function withCleanEnv(fn) {
  delete process.env[KEY]
  delete process.env.hasOwnProperty
  try {
    fn()
  } finally {
    delete process.env[KEY]
    delete process.env.hasOwnProperty
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

it('should check env var existence with a dynamic key', () => {
  withCleanEnv(() => {
    const key = [KEY][0]
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
