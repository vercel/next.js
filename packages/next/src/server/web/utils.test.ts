import { toNodeHeaders } from './utils'

// We use `Headers` here which is provided by the polyfill.
import '../node-polyfill-fetch'

describe('toNodeHeaders', () => {
  it('should handle multiple set-cookie headers correctly', () => {
    const headers = new Headers()

    headers.append('set-cookie', 'foo=bar')
    headers.append('set-cookie', 'bar=foo')

    expect(toNodeHeaders(headers)).toEqual({
      'set-cookie': ['foo=bar', 'bar=foo'],
    })
  })

  it('should handle a single set-cookie header correctly', () => {
    const headers = new Headers()

    headers.append('set-cookie', 'foo=bar')

    expect(toNodeHeaders(headers)).toEqual({
      'set-cookie': 'foo=bar',
    })
  })

  it('should handle a single set-cookie header with multiple cookies correctly', () => {
    const headers = new Headers()

    headers.append('set-cookie', 'foo=bar, bar=foo')

    expect(toNodeHeaders(headers)).toEqual({
      'set-cookie': ['foo=bar', 'bar=foo'],
    })

    headers.append('set-cookie', 'baz=qux')

    expect(toNodeHeaders(headers)).toEqual({
      'set-cookie': ['foo=bar', 'bar=foo', 'baz=qux'],
    })
  })

  it('should handle mixed case set-cookie headers correctly', () => {
    const headers = new Headers()

    headers.append('set-cookie', 'foo=bar')
    headers.append('Set-Cookie', 'bar=foo')

    expect(toNodeHeaders(headers)).toEqual({
      'set-cookie': ['foo=bar', 'bar=foo'],
    })
  })

  it('should return an empty object when no headers are provided', () => {
    expect(toNodeHeaders()).toEqual({})
  })
})
