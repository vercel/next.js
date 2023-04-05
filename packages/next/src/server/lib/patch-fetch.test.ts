// import { URL } from 'url'
import { StaticGenerationStore } from '../../client/components/static-generation-async-storage'
import { getOption, getRevalidate } from './patch-fetch'

// Polyfill fetch for tests.
import '../node-polyfill-fetch'
import { CACHE_ONE_YEAR } from '../../lib/constants'

const defaultURL = new URL('https://example.com/some/path')

function createStore(
  partial: Partial<StaticGenerationStore> = {},
  pathname: string = defaultURL.pathname
): StaticGenerationStore {
  return {
    isStaticGeneration: false,
    pathname,
    ...partial,
  }
}

function createInit(partial: Partial<RequestInit> = {}): RequestInit {
  return {
    method: 'GET',
    headers: new Headers(),
    ...partial,
  }
}

describe('getRevalidate', () => {
  const defaultInput: RequestInfo = defaultURL.toString()
  const defaultInit = createInit()
  const defaultStore = createStore()

  test('returns CACHE_ONE_YEAR for fetchNextRevalidate undefined', () => {
    const revalidate = getRevalidate(
      undefined,
      defaultInput,
      defaultInit,
      defaultStore
    )
    expect(revalidate).toBe(CACHE_ONE_YEAR)
  })

  test('returns CACHE_ONE_YEAR for fetchNextRevalidate false', () => {
    const revalidate = getRevalidate(
      false,
      defaultInput,
      defaultInit,
      defaultStore
    )
    expect(revalidate).toBe(CACHE_ONE_YEAR)
  })

  test('returns provided fetchNextRevalidate number', () => {
    const revalidate = getRevalidate(
      60,
      defaultInput,
      defaultInit,
      defaultStore
    )
    expect(revalidate).toBe(60)
  })

  test('returns store.revalidate for non-cacheable method and store.revalidate !== 0', () => {
    const store = createStore({ revalidate: 10 })
    const init = createInit({ method: 'POST' })

    const revalidate = getRevalidate(undefined, defaultInput, init, store)
    expect(revalidate).toBe(10)
  })

  test('returns store.revalidate for non-cacheable headers and store.revalidate !== 0', () => {
    const store = createStore({ revalidate: 10 })
    const headers = new Headers()
    headers.set('authorization', 'Bearer some_token')
    const init = createInit({ headers })

    const revalidate = getRevalidate(undefined, defaultInput, init, store)
    expect(revalidate).toBe(10)
  })

  test('throws error when fetchCache is no-store and store is only-cache', () => {
    const store = createStore({ fetchCache: 'only-cache' })
    const init = createInit({ cache: 'no-store' })
    expect(() =>
      getRevalidate(undefined, defaultInput, init, store)
    ).toThrowError(
      `cache: 'no-store' used on fetch for ${defaultInput} with 'export const fetchCache = 'only-cache'`
    )
  })

  test('throws error when fetchCache is force-cache and store is only-no-store', () => {
    const store = createStore({ fetchCache: 'only-no-store' })
    const init = createInit({ cache: 'force-cache' })
    expect(() =>
      getRevalidate(undefined, defaultInput, init, store)
    ).toThrowError(
      `cache: 'force-cache' used on fetch for ${defaultInput} with 'export const fetchCache = 'only-no-store'`
    )
  })

  test('returns CACHE_ONE_YEAR for undefined fetchNextRevalidate and store.revalidate', () => {
    const revalidate = getRevalidate(
      undefined,
      defaultInput,
      defaultInit,
      defaultStore
    )
    expect(revalidate).toBe(CACHE_ONE_YEAR)
  })

  test('returns 0 for default-no-store fetchCache', () => {
    const store = createStore({ fetchCache: 'default-no-store' })
    const revalidate = getRevalidate(
      undefined,
      defaultInput,
      defaultInit,
      store
    )
    expect(revalidate).toBe(0)
  })

  test('returns store.revalidate when set as a number', () => {
    const store = createStore({ revalidate: 120 })
    const revalidate = getRevalidate(
      undefined,
      defaultInput,
      defaultInit,
      store
    )
    expect(revalidate).toBe(120)
  })

  test('returns 0 for store.fetchCache set to force-no-store', () => {
    const store = createStore({ fetchCache: 'force-no-store' })
    const revalidate = getRevalidate(
      undefined,
      defaultInput,
      defaultInit,
      store
    )
    expect(revalidate).toBe(0)
  })

  test('returns CACHE_ONE_YEAR for store.fetchCache set to force-cache', () => {
    const store = createStore({ fetchCache: 'force-cache' })
    const revalidate = getRevalidate(
      undefined,
      defaultInput,
      defaultInit,
      store
    )
    expect(revalidate).toBe(CACHE_ONE_YEAR)
  })

  test('returns 0 for fetchCache set to no-cache', () => {
    const init = createInit({ cache: 'no-cache' })
    const revalidate = getRevalidate(
      undefined,
      defaultInput,
      init,
      defaultStore
    )
    expect(revalidate).toBe(0)
  })

  test('returns 0 for fetchCache set to no-store', () => {
    const init = createInit({ cache: 'no-store' })
    const revalidate = getRevalidate(
      undefined,
      defaultInput,
      init,
      defaultStore
    )
    expect(revalidate).toBe(0)
  })

  test('returns CACHE_ONE_YEAR for fetchCache set to force-cache', () => {
    const init = createInit({ cache: 'force-cache' })
    const revalidate = getRevalidate(
      undefined,
      defaultInput,
      init,
      defaultStore
    )
    expect(revalidate).toBe(CACHE_ONE_YEAR)
  })

  test('returns 0 for store.revalidate set to 0 and non-cacheable method', () => {
    const init = createInit({ method: 'POST' })
    const store = createStore({ revalidate: 0 })
    const revalidate = getRevalidate(undefined, defaultInput, init, store)
    expect(revalidate).toBe(0)
  })

  test('returns 0 for store.revalidate set to 0 and non-cacheable headers', () => {
    const store = createStore({ revalidate: 0 })
    const headers = new Headers()
    headers.set('authorization', 'Bearer some_token')
    const init = createInit({ headers })
    const revalidate = getRevalidate(undefined, defaultInput, init, store)
    expect(revalidate).toBe(0)
  })

  test('returns 0 for store.fetchCache set to only-no-store', () => {
    const store = createStore({ fetchCache: 'only-no-store' })
    const revalidate = getRevalidate(
      undefined,
      defaultInput,
      defaultInit,
      store
    )
    expect(revalidate).toBe(0)
  })
})

describe('getOption', () => {
  const defaultInput = defaultURL.toString()

  // Test when init is truthy and key exists in init
  it('should return the value from init when init is truthy and key exists in init', () => {
    const input: RequestInfo = new Request(defaultURL)
    const init: RequestInit = { method: 'POST' }
    const key: keyof RequestInit = 'method'

    const result = getOption(input, init, key)

    expect(result).toBe(init[key])
  })

  // Test when init is truthy but key does not exist in init and input is not an instance of Request
  it('should return undefined when init is truthy, key does not exist in init, and input is not an instance of Request', () => {
    const init: RequestInit = { method: 'POST' }
    const key: keyof RequestInit = 'cache'

    const result = getOption(defaultInput, init, key)

    expect(result).toBeUndefined()
  })

  // Test when init is truthy but key does not exist in init and input is an instance of Request
  it('should return the value from input when init is truthy, key does not exist in init, and input is an instance of Request', () => {
    const input: RequestInfo = new Request(defaultURL, { method: 'PUT' })
    const init: RequestInit = { method: 'POST' }
    const key = 'method'

    const result = getOption(input, init, key)

    expect(result).toBe(init[key])
  })

  // Test when init is falsy and input is not an instance of Request
  it('should return undefined when init is falsy and input is not an instance of Request', () => {
    const init: RequestInit | undefined = undefined
    const key: keyof Request = 'method'

    const result = getOption(defaultInput, init, key)

    expect(result).toBeUndefined()
  })

  // Test when init is falsy and input is an instance of Request
  it('should return the value from input when init is falsy and input is an instance of Request', () => {
    const input: RequestInfo = new Request(defaultURL, { method: 'PUT' })
    const init: RequestInit | undefined = undefined
    const key = 'method'

    const result = getOption(input, init, key)

    expect(result).toBe((input as Request)[key])
  })
})
