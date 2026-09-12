import type { RequestStore } from '../../../app-render/work-unit-async-storage.external'
import type { WorkStore } from '../../../app-render/work-async-storage.external'
import {
  ActionDidRevalidateDynamicOnly,
  ActionDidRevalidateStaticAndDynamic,
} from '../../../../shared/lib/action-revalidation-kind'
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
    expect(() => (sealed as any).set('foo', 'bar2')).toThrow(
      ReadonlyRequestCookiesError
    )
    expect(() => (sealed as any).delete('foo')).toThrow(
      ReadonlyRequestCookiesError
    )
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
    expect(() => (sealed as any).set('foo', 'bar2')).toThrow(
      ReadonlyRequestCookiesError
    )
    expect(() => (sealed as any).delete('foo')).toThrow(
      ReadonlyRequestCookiesError
    )
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

describe('cookie mutation revalidation opt-out', () => {
  let workAsyncStorage: typeof import('../../../app-render/work-async-storage.external').workAsyncStorage
  let requestCookiesModule: typeof import('./request-cookies')

  beforeAll(() => {
    ;(globalThis as any).AsyncLocalStorage ??= (
      require('node:async_hooks') as typeof import('node:async_hooks')
    ).AsyncLocalStorage
    jest.resetModules()
    workAsyncStorage = (
      require('../../../app-render/work-async-storage.external') as typeof import('../../../app-render/work-async-storage.external')
    ).workAsyncStorage
    requestCookiesModule =
      require('./request-cookies') as typeof import('./request-cookies')
  })

  const createMockWorkStore = () =>
    ({ pathWasRevalidated: undefined }) as unknown as WorkStore

  const wrapCookies = (onUpdateCookies?: (cookies: string[]) => void) =>
    requestCookiesModule.MutableRequestCookiesAdapter.wrap(
      new RequestCookies(new Headers({})),
      onUpdateCookies
    )

  it('marks the path as revalidated when set() is called', () => {
    const workStore = createMockWorkStore()
    workAsyncStorage.run(workStore, () => {
      const cookies = wrapCookies()
      cookies.set('foo', '1')

      expect(workStore.pathWasRevalidated).toBe(
        ActionDidRevalidateStaticAndDynamic
      )
      expect(
        requestCookiesModule.didMutatedCookiesRequestRevalidation(cookies)
      ).toBe(true)
    })
  })

  it('does not mark the path as revalidated when set() is called with revalidate: false', () => {
    const workStore = createMockWorkStore()
    workAsyncStorage.run(workStore, () => {
      const onUpdateCookies = jest.fn<void, [string[]]>()
      const cookies = wrapCookies(onUpdateCookies)
      cookies.set('foo', '1', { revalidate: false })

      expect(workStore.pathWasRevalidated).toBeUndefined()
      expect(
        requestCookiesModule.didMutatedCookiesRequestRevalidation(cookies)
      ).toBe(false)

      // The cookie must still be set and emitted to the response.
      expect(cookies.get('foo')?.value).toBe('1')
      expect(onUpdateCookies).toHaveBeenCalledWith([
        expect.stringContaining('foo=1'),
      ])

      // The cookie must still be recorded as modified, so that route
      // handlers and redirects emit it via `appendMutableCookies`.
      expect(requestCookiesModule.getModifiedCookieValues(cookies)).toEqual([
        expect.objectContaining({ name: 'foo', value: '1' }),
      ])

      // The `revalidate` option must not be stored on the cookie.
      expect(cookies.get('foo')).not.toHaveProperty('revalidate')
    })
  })

  it('supports revalidate: false in the single options object form of set()', () => {
    const workStore = createMockWorkStore()
    workAsyncStorage.run(workStore, () => {
      const cookies = wrapCookies()
      cookies.set({ name: 'foo', value: '1', path: '/x', revalidate: false })

      expect(workStore.pathWasRevalidated).toBeUndefined()
      expect(cookies.get('foo')).toMatchObject({
        name: 'foo',
        value: '1',
        path: '/x',
      })
      expect(cookies.get('foo')).not.toHaveProperty('revalidate')
    })
  })

  it('marks the path as revalidated when delete() is called with a name', () => {
    const workStore = createMockWorkStore()
    workAsyncStorage.run(workStore, () => {
      const cookies = wrapCookies()
      cookies.delete('foo')

      expect(workStore.pathWasRevalidated).toBe(
        ActionDidRevalidateStaticAndDynamic
      )
      expect(
        requestCookiesModule.didMutatedCookiesRequestRevalidation(cookies)
      ).toBe(true)
    })
  })

  it('does not mark the path as revalidated when delete() is called with revalidate: false', () => {
    const workStore = createMockWorkStore()
    workAsyncStorage.run(workStore, () => {
      const onUpdateCookies = jest.fn<void, [string[]]>()
      const cookies = wrapCookies(onUpdateCookies)
      cookies.delete({ name: 'foo', revalidate: false })

      expect(workStore.pathWasRevalidated).toBeUndefined()
      expect(
        requestCookiesModule.didMutatedCookiesRequestRevalidation(cookies)
      ).toBe(false)

      // The deletion must still be emitted to the response and recorded as a
      // modified cookie.
      expect(onUpdateCookies).toHaveBeenCalledWith([
        expect.stringContaining('foo=;'),
      ])
      expect(requestCookiesModule.getModifiedCookieValues(cookies)).toEqual([
        expect.objectContaining({ name: 'foo', value: '' }),
      ])

      // The `revalidate` option must not be stored on the expired cookie.
      expect(cookies.get('foo')).not.toHaveProperty('revalidate')
    })
  })

  it('preserves cookie objects whose properties are inherited accessors', () => {
    const workStore = createMockWorkStore()
    workAsyncStorage.run(workStore, () => {
      const cookies = wrapCookies()

      class AccessorCookie {
        httpOnly = true
        get name() {
          return 'sid'
        }
        get value() {
          return 'token'
        }
      }

      // Without the `revalidate` option, the object is forwarded untouched.
      cookies.set(new AccessorCookie())
      expect(cookies.get('sid')).toMatchObject({
        name: 'sid',
        value: 'token',
        httpOnly: true,
      })
      expect(workStore.pathWasRevalidated).toBe(
        ActionDidRevalidateStaticAndDynamic
      )

      class AccessorCookieOptOut extends AccessorCookie {
        revalidate = false
      }

      // With the option, `name` and `value` must survive the stripping even
      // though they aren't own enumerable properties.
      workStore.pathWasRevalidated = undefined
      const otherCookies = wrapCookies()
      otherCookies.set(new AccessorCookieOptOut())
      expect(otherCookies.get('sid')).toMatchObject({
        name: 'sid',
        value: 'token',
        httpOnly: true,
      })
      expect(otherCookies.get('sid')).not.toHaveProperty('revalidate')
      expect(workStore.pathWasRevalidated).toBeUndefined()
    })
  })

  it('does not undo a requested revalidation with a later opted-out mutation', () => {
    const workStore = createMockWorkStore()
    workAsyncStorage.run(workStore, () => {
      const cookies = wrapCookies()
      cookies.set('foo', '1')
      cookies.set('bar', '2', { revalidate: false })

      expect(workStore.pathWasRevalidated).toBe(
        ActionDidRevalidateStaticAndDynamic
      )
      expect(
        requestCookiesModule.didMutatedCookiesRequestRevalidation(cookies)
      ).toBe(true)
    })
  })

  it('requests revalidation when an opted-out mutation is followed by a normal one', () => {
    const workStore = createMockWorkStore()
    workAsyncStorage.run(workStore, () => {
      const cookies = wrapCookies()
      cookies.set('foo', '1', { revalidate: false })

      expect(
        requestCookiesModule.didMutatedCookiesRequestRevalidation(cookies)
      ).toBe(false)

      cookies.set('bar', '2')

      expect(workStore.pathWasRevalidated).toBe(
        ActionDidRevalidateStaticAndDynamic
      )
      expect(
        requestCookiesModule.didMutatedCookiesRequestRevalidation(cookies)
      ).toBe(true)
    })
  })

  it('does not overwrite a revalidation kind set by another API', () => {
    const workStore = createMockWorkStore()
    workAsyncStorage.run(workStore, () => {
      // Simulate a preceding refresh() call.
      workStore.pathWasRevalidated = ActionDidRevalidateDynamicOnly

      const cookies = wrapCookies()
      cookies.set('foo', '1', { revalidate: false })

      expect(workStore.pathWasRevalidated).toBe(ActionDidRevalidateDynamicOnly)
    })
  })

  it('honors revalidate: false through the userspace mutable cookies proxy', () => {
    const workStore = createMockWorkStore()
    workAsyncStorage.run(workStore, () => {
      const requestStore = {
        type: 'request',
        phase: 'action',
        mutableCookies: wrapCookies(),
      } as RequestStore
      const cookies =
        requestCookiesModule.createCookiesWithMutableAccessCheck(requestStore)

      cookies.set('foo', '1', { revalidate: false })
      cookies.delete({ name: 'bar', revalidate: false })

      expect(workStore.pathWasRevalidated).toBeUndefined()
      expect(cookies.get('foo')?.value).toBe('1')

      cookies.set('baz', '2')

      expect(workStore.pathWasRevalidated).toBe(
        ActionDidRevalidateStaticAndDynamic
      )
    })
  })
})
