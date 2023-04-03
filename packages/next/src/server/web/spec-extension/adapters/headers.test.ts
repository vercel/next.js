import type { IncomingHttpHeaders } from 'http'

// We use `Headers` here which is provided by the polyfill.
import '../../../node-polyfill-fetch'

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
  it('should be able to seal a Headers instance', () => {
    const headers = new Headers({
      'content-type': 'application/json',
      'x-custom-header': 'custom',
    })
    const sealed = HeadersAdapter.seal(headers)
    expect(sealed).toBeInstanceOf(Headers)

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
})
