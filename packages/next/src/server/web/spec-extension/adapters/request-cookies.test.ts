import { RequestCookies } from '../cookies'
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
