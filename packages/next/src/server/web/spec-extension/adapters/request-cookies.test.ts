import type { RequestStore } from '../../../app-render/work-unit-async-storage.external'
import { RequestCookies, ResponseCookies } from '../cookies'
import {
  ReadonlyRequestCookiesError,
  RequestCookiesAdapter,
  MutableRequestCookiesAdapter,
} from './request-cookies'

describe('RequestCookiesAdapter', () => {
  it('should be able to create a new instance from a RequestCookies', () => {
    const headers = new Headers({ cookie: 'foo=bar; bar=foo' })
    const cookies = new RequestCookies(headers)

    const sealed = RequestCookiesAdapter.seal(cookies)
    expect(sealed).toBeInstanceOf(RequestCookies)

    expect(sealed.get('foo')).toEqual({ name: 'foo', value: 'bar' })
    expect(sealed.get('bar')).toEqual({ name: 'bar', value: 'foo' })

    // These methods are not available on the sealed instance
    expect(() => sealed.set('foo', 'bar2')).toThrow(ReadonlyRequestCookiesError)
    expect(() => sealed.delete('foo')).toThrow(ReadonlyRequestCookiesError)
    expect(() => (sealed as any).clear()).toThrow(ReadonlyRequestCookiesError)

    // Ensure nothing was actually changed.
    expect(sealed.get('foo')).toEqual({ name: 'foo', value: 'bar' })
    expect(sealed.get('bar')).toEqual({ name: 'bar', value: 'foo' })
  })
  it('should be able to create a new instance from an empty RequestCookies', () => {
    const headers = new Headers({})
    const cookies = new RequestCookies(headers)

    const sealed = RequestCookiesAdapter.seal(cookies)
    expect(sealed).toBeInstanceOf(RequestCookies)

    expect(sealed.get('foo')).toEqual(undefined)
    expect(sealed.get('bar')).toEqual(undefined)

    // These methods are not available on the sealed instance
    expect(() => sealed.set('foo', 'bar2')).toThrow(ReadonlyRequestCookiesError)
    expect(() => sealed.delete('foo')).toThrow(ReadonlyRequestCookiesError)
    expect(() => (sealed as any).clear()).toThrow(ReadonlyRequestCookiesError)

    // Ensure nothing was actually changed.
    expect(sealed.get('foo')).toEqual(undefined)
    expect(sealed.get('bar')).toEqual(undefined)
  })
})

describe('MutableRequestCookiesAdapter', () => {
  it('supports chained set calls and preserves wrapping', () => {
    const headers = new Headers({})
    const underlyingCookies = new RequestCookies(headers)
    const onUpdateCookies = jest.fn<void, [string[]]>()

    const wrappedCookies = MutableRequestCookiesAdapter.wrap(
      underlyingCookies,
      onUpdateCookies
    )

    const returned = wrappedCookies.set('foo', '1').set('bar', '2')

    expect(returned).toBe(wrappedCookies)
    expect(onUpdateCookies).toHaveBeenCalledWith([
      expect.stringContaining('foo=1'),
    ])
    expect(onUpdateCookies).toHaveBeenCalledWith([
      expect.stringContaining('foo=1'),
      expect.stringContaining('bar=2'),
    ])
  })

  it('supports chained delete calls and preserves wrapping', () => {
    const headers = new Headers({})
    const underlyingCookies = new RequestCookies(headers)
    underlyingCookies.set('foo', '1').set('bar', '2')

    const onUpdateCookies = jest.fn<void, [string[]]>()
    const wrappedCookies = MutableRequestCookiesAdapter.wrap(
      underlyingCookies,
      onUpdateCookies
    )

    const returned = wrappedCookies.delete('foo').delete('bar')

    expect(returned).toBe(wrappedCookies)
    expect(onUpdateCookies).toHaveBeenCalledWith([
      expect.stringContaining('foo=;'),
    ])
    expect(onUpdateCookies).toHaveBeenCalledWith([
      expect.stringContaining('foo=;'),
      expect.stringContaining('bar=;'),
    ])
  })
})

describe('wrapWithMutableAccessCheck', () => {
  let workUnitAsyncStorage: typeof import('../../../app-render/work-unit-async-storage.external').workUnitAsyncStorage
  let createCookiesWithMutableAccessCheck: typeof import('./request-cookies').createCookiesWithMutableAccessCheck

  beforeAll(() => {
    ;(globalThis as any).AsyncLocalStorage ??= (
      require('node:async_hooks') as typeof import('node:async_hooks')
    ).AsyncLocalStorage
    jest.resetModules()
    workUnitAsyncStorage = (
      require('../../../app-render/work-unit-async-storage.external') as typeof import('../../../app-render/work-unit-async-storage.external')
    ).workUnitAsyncStorage
    createCookiesWithMutableAccessCheck = (
      require('./request-cookies') as typeof import('./request-cookies')
    ).createCookiesWithMutableAccessCheck
  })

  const createMockRequestStore = (phase: RequestStore['phase']) => {
    const headers = new Headers({})
    const underlyingCookies = new ResponseCookies(headers)

    return {
      type: 'request',
      phase,
      mutableCookies: underlyingCookies,
    } as RequestStore
  }

  it('prevents setting cookies in the render phase', () => {
    const requestStore = createMockRequestStore('action')
    workUnitAsyncStorage.run(requestStore, () => {
      const cookies = createCookiesWithMutableAccessCheck(requestStore)

      // simulate changing phases
      requestStore.phase = 'render'

      const EXPECTED_ERROR =
        /Cookies can only be modified in a Server Action or Route Handler\./

      expect(() => {
        cookies.set('foo', '1')
      }).toThrow(EXPECTED_ERROR)

      expect(cookies.get('foo')).toBe(undefined)
    })
  })

  it('prevents deleting cookies in the render phase', () => {
    const requestStore = createMockRequestStore('action')
    workUnitAsyncStorage.run(requestStore, () => {
      const cookies = createCookiesWithMutableAccessCheck(requestStore)
      cookies.set('foo', '1')

      // simulate changing phases
      requestStore.phase = 'render'

      const EXPECTED_ERROR =
        /Cookies can only be modified in a Server Action or Route Handler\./

      expect(() => {
        cookies.delete('foo')
      }).toThrow(EXPECTED_ERROR)
      expect(cookies.get('foo')?.value).toEqual('1')
    })
  })
})

describe('MutableRequestCookiesAdapter.wrap with the cookies of a request', () => {
  // What `wrap` did before: `set` for every request cookie.
  function setEach(cookies: RequestCookies): ResponseCookies {
    const responseCookies = new ResponseCookies(new Headers())
    for (const cookie of cookies.getAll()) {
      responseCookies.set(cookie)
    }
    return responseCookies
  }

  it.each([
    '',
    'a=1',
    'a=1; b=2',
    'a=1; b=2; c=3; d=; e=x=y; f=%E2%9C%93; g; h="quoted"; a=4; i=%',
  ])('leaves what setting each cookie leaves: %p', (cookie) => {
    const expected = setEach(new RequestCookies(new Headers({ cookie })))
    const wrapped = MutableRequestCookiesAdapter.wrap(
      new RequestCookies(new Headers({ cookie }))
    )

    expect(wrapped.getAll()).toEqual(expected.getAll())
    expect(wrapped.toString()).toEqual(expected.toString())
    // The headers that `ResponseCookies` writes its cookies to.
    expect((wrapped as any)._headers.getSetCookie()).toEqual(
      (expected as any)._headers.getSetCookie()
    )
  })

  // `wrap` puts all request cookies but the last into the map that
  // `ResponseCookies` keeps its cookies in, an internal field, and falls back
  // to `set` for every cookie when that field is not what it expects. These
  // two tests fail when an update of `@edge-runtime/cookies` moves the field,
  // so that the fallback cannot become the only path unnoticed.
  it('sets only the last request cookie', () => {
    const set = jest.spyOn(ResponseCookies.prototype, 'set')
    try {
      MutableRequestCookiesAdapter.wrap(
        new RequestCookies(new Headers({ cookie: 'a=1; b=2; c=3; d=4' }))
      )
      expect(set).toHaveBeenCalledTimes(1)
    } finally {
      set.mockRestore()
    }
  })

  it('finds the cookies of a new ResponseCookies in an empty map', () => {
    expect((new ResponseCookies(new Headers()) as any)._parsed).toEqual(
      new Map()
    )
  })
})
