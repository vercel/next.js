import type { IncomingHttpHeaders } from 'http'

import { HeadersAdapter, ReadonlyHeadersError } from './headers'

describe('HeadersAdapter', () => {
  it('should be able to create a new instance from an IncomingHttpHeaders', () => {
    const headers = {
      'content-type': 'application/json',
      'x-custom-header': 'custom',
    }
    const adapter = HeadersAdapter.from(headers)
    expect(adapter).toBeInstanceOf(HeadersAdapter)
    expect(adapter.get('content-type')).toBe('application/json')
    expect(adapter.get('x-custom-header')).toBe('custom')
  })

  it('should be able to create a new instance from a Headers', () => {
    const headers = new Headers({
      'content-type': 'application/json',
      'x-custom-header': 'custom',
    })
    const adapter = HeadersAdapter.from(headers)
    expect(adapter).toBeInstanceOf(Headers)
    expect(adapter.get('content-type')).toBe('application/json')
    expect(adapter.get('x-custom-header')).toBe('custom')
  })

  it('should be able to create a new instance from a HeadersAdapter', () => {
    const headers = new HeadersAdapter({
      'content-type': 'application/json',
      'x-custom-header': 'custom',
    })
    const adapter = HeadersAdapter.from(headers)
    expect(adapter).toBeInstanceOf(HeadersAdapter)
    expect(adapter.get('content-type')).toBe('application/json')
    expect(adapter.get('x-custom-header')).toBe('custom')
  })

  it('should be able to create a new instance from an object', () => {
    const headers = {
      'content-type': 'application/json',
      'x-custom-header': 'custom',
    }
    const adapter = new HeadersAdapter(headers)
    expect(adapter).toBeInstanceOf(HeadersAdapter)
    expect(adapter.get('content-type')).toBe('application/json')
    expect(adapter.get('x-custom-header')).toBe('custom')
  })

  it('should handle multiple values for a header', () => {
    const headers: IncomingHttpHeaders = {
      'content-type': 'application/json',
      'x-custom-headers': ['custom', 'custom2'],
    }
    const adapter = HeadersAdapter.from(headers)
    expect(adapter).toBeInstanceOf(HeadersAdapter)
    expect(adapter.get('content-type')).toBe('application/json')
    expect(adapter.get('x-custom-headers')).toBe('custom, custom2')
  })

  describe('entries', () => {
    it('should return an iterator of entries', () => {
      const headers = new HeadersAdapter({
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom',
      })
      expect(headers).toBeInstanceOf(HeadersAdapter)
      expect(headers).toBeInstanceOf(Headers)

      // Check to see that the entries is an iterator.
      const entries = headers.entries()
      expect(typeof entries[Symbol.iterator]).toBe('function')
      expect(typeof entries.next).toBe('function')

      headers.set('x-custom-header', 'custom2')

      // Check to see that the iterator returns the correct values with
      // lowercased header names.
      const array = Array.from(headers.entries())
      expect(array).toBeInstanceOf(Array)
      expect(array).toHaveLength(2)
      expect(array).toEqual([
        ['content-type', 'application/json'],
        ['x-custom-header', 'custom2'],
      ])
    })
  })

  describe('keys', () => {
    it('should return an iterator of keys', () => {
      const headers = new HeadersAdapter({
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom',
      })

      // Check to see that the keys is an iterator.
      const keys = headers.keys()
      expect(typeof keys[Symbol.iterator]).toBe('function')
      expect(typeof keys.next).toBe('function')

      headers.set('x-custom-header', 'custom2')

      // Check to see that the iterator returns the correct values with
      // lowercased header names.
      const array = Array.from(headers.keys())
      expect(array).toBeInstanceOf(Array)
      expect(array).toHaveLength(2)
      expect(array).toEqual(['content-type', 'x-custom-header'])
    })
  })

  describe('values', () => {
    it('should return an iterator of values', () => {
      const headers = new HeadersAdapter({
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom',
      })

      // Check to see that the values is an iterator.
      const values = headers.values()
      expect(typeof values[Symbol.iterator]).toBe('function')
      expect(typeof values.next).toBe('function')

      headers.set('x-custom-header', 'custom2')

      // Check to see that the iterator returns the correct values.
      const array = Array.from(headers.values())
      expect(array).toBeInstanceOf(Array)
      expect(array).toHaveLength(2)
      expect(array).toEqual(['application/json', 'custom2'])
    })
  })

  describe('forEach', () => {
    it('should iterate over all entries', () => {
      const headers = new HeadersAdapter({
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom',
      })

      const spy = jest.fn()
      headers.forEach(spy)

      expect(spy).toHaveBeenCalledTimes(2)
      expect(spy).toHaveBeenNthCalledWith(
        1,
        'application/json',
        'content-type',
        headers
      )
      expect(spy).toHaveBeenNthCalledWith(
        2,
        'custom',
        'x-custom-header',
        headers
      )
    })
  })

  describe('iterator', () => {
    it('should iterate over all entries', () => {
      const headers = new HeadersAdapter({
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom',
      })

      const array = Array.from(headers)
      expect(array).toBeInstanceOf(Array)
      expect(array).toHaveLength(2)

      expect(array).toEqual([
        ['content-type', 'application/json'],
        ['x-custom-header', 'custom'],
      ])

      headers.set('x-custom-header', 'custom2')

      const array2 = Array.from(headers)
      expect(array2).toBeInstanceOf(Array)
      expect(array2).toHaveLength(2)

      expect(array2).toEqual([
        ['content-type', 'application/json'],
        ['x-custom-header', 'custom2'],
      ])
    })
  })

  describe('case-insensitive', () => {
    it('should handle different case for header names', () => {
      const headers = new HeadersAdapter({
        'Content-Type': 'application/json',
      })
      expect(headers).toBeInstanceOf(HeadersAdapter)
      expect(headers).toBeInstanceOf(Headers)

      expect(headers.get('content-type')).toBe('application/json')
      expect(headers.get('Content-Type')).toBe('application/json')
    })

    it('should handle different case for header names when mutated out of band', () => {
      const incoming: IncomingHttpHeaders = {
        'Content-Type': 'application/json',
      }
      const headers = new HeadersAdapter(incoming)
      expect(headers).toBeInstanceOf(HeadersAdapter)
      expect(headers).toBeInstanceOf(Headers)

      expect(headers.get('content-type')).toBe('application/json')
      expect(headers.get('Content-Type')).toBe('application/json')

      incoming['X-Custom-Header'] = 'custom'

      expect(headers.get('X-Custom-Header')).toBe('custom')
      expect(headers.get('x-custom-header')).toBe('custom')

      headers.set('x-custom-header', 'custom2')

      expect(headers.get('X-Custom-Header')).toBe('custom2')
      expect(headers.get('x-custom-header')).toBe('custom2')

      // Ensure the original headers object was mutated.
      expect(incoming['X-Custom-Header']).toBe('custom2')
    })
  })

  describe('sealed', () => {
    it('should be able to seal a Headers instance', () => {
      const headers = new Headers({
        'content-type': 'application/json',
        'x-custom-header': 'custom',
      })
      const sealed = HeadersAdapter.seal(headers)
      expect(sealed).toBeInstanceOf(Headers)

      expect(sealed.get('content-type')).toBe('application/json')
      expect(sealed.get('x-custom-header')).toBe('custom')

      // These methods are not available on the sealed instance
      expect(() =>
        (sealed as any).append('x-custom-header', 'custom2')
      ).toThrowError(ReadonlyHeadersError)
      expect(() =>
        (sealed as any).append('x-custom-header', 'custom2')
      ).toThrowError(ReadonlyHeadersError)
      expect(() => (sealed as any).delete('x-custom-header')).toThrowError(
        ReadonlyHeadersError
      )
      expect(() =>
        (sealed as any).set('x-custom-header', 'custom2')
      ).toThrowError(ReadonlyHeadersError)

      expect(sealed.get('content-type')).toBe('application/json')
      expect(sealed.get('x-custom-header')).toBe('custom')
    })

    it('should be able to seal a HeadersAdapter instance', () => {
      const headers = new HeadersAdapter({
        'content-type': 'application/json',
        'x-custom-header': 'custom',
      })
      const sealed = HeadersAdapter.seal(headers)
      expect(sealed).toBeInstanceOf(HeadersAdapter)
      expect(sealed).toBeInstanceOf(Headers)

      // These methods are not available on the sealed instance
      expect(() =>
        (sealed as any).append('x-custom-header', 'custom2')
      ).toThrowError(ReadonlyHeadersError)
      expect(() => (sealed as any).delete('x-custom-header')).toThrowError(
        ReadonlyHeadersError
      )
      expect(() =>
        (sealed as any).set('x-custom-header', 'custom2')
      ).toThrowError(ReadonlyHeadersError)

      // Ensure nothing was actually changed.
      expect(sealed.get('content-type')).toBe('application/json')
      expect(sealed.get('x-custom-header')).toBe('custom')
    })

    it('should be able to seal a HeadersAdapter and still mutate the original', () => {
      const incoming: IncomingHttpHeaders = {
        'content-type': 'application/json',
        'X-Custom-Header': 'custom',
      }

      const headers = new HeadersAdapter(incoming)
      const sealed = HeadersAdapter.seal(headers)
      expect(sealed).toBeInstanceOf(HeadersAdapter)
      expect(sealed).toBeInstanceOf(Headers)

      // These methods are not available on the sealed instance
      expect(() =>
        (sealed as any).append('x-custom-header', 'custom2')
      ).toThrowError(ReadonlyHeadersError)
      expect(() => (sealed as any).delete('x-custom-header')).toThrowError(
        ReadonlyHeadersError
      )
      expect(() =>
        (sealed as any).set('x-custom-header', 'custom2')
      ).toThrowError(ReadonlyHeadersError)

      // Ensure nothing was actually changed.
      expect(sealed.get('content-type')).toBe('application/json')
      expect(sealed.get('x-custom-header')).toBe('custom')

      // Mutate the original.
      headers.append('x-custom-header', 'custom2')

      // Ensure the original was mutated.
      expect(headers.get('content-type')).toBe('application/json')
      expect(headers.get('x-custom-header')).toBe('custom, custom2')

      // Mutate the incoming headers object.
      incoming['X-Custom-Header'] = 'custom3'

      expect(headers.get('x-custom-header')).toBe('custom3')
      expect(sealed.get('x-custom-header')).toBe('custom3')
    })
  })
})
