import { normalizeLoopbackHostname, toNodeOutgoingHttpHeaders } from './utils'

describe('normalizeLoopbackHostname', () => {
  it.each([
    ['localhost', 'localhost'],
    ['LOCALHOST', 'localhost'],
    ['127.0.0.1', 'localhost'],
    ['127.255.255.255', 'localhost'],
    ['::1', 'localhost'],
    ['[::1]', 'localhost'],
    ['127.0.0.256', '127.0.0.256'],
    ['192.168.0.1', '192.168.0.1'],
    ['example.com', 'example.com'],
  ])('normalizes %s to %s', (hostname, expected) => {
    expect(normalizeLoopbackHostname(hostname)).toBe(expected)
  })
})

describe('toNodeHeaders', () => {
  it('should handle multiple set-cookie headers correctly', () => {
    const headers = new Headers()

    headers.append('set-cookie', 'foo=bar')
    headers.append('set-cookie', 'bar=foo')

    expect(toNodeOutgoingHttpHeaders(headers)).toEqual({
      'set-cookie': ['foo=bar', 'bar=foo'],
    })
  })

  it('should handle a single set-cookie header correctly', () => {
    const headers = new Headers()

    headers.append('set-cookie', 'foo=bar')

    expect(toNodeOutgoingHttpHeaders(headers)).toEqual({
      'set-cookie': 'foo=bar',
    })
  })

  it('should handle a single set-cookie header with multiple cookies correctly', () => {
    const headers = new Headers()

    headers.append('set-cookie', 'foo=bar, bar=foo')

    expect(toNodeOutgoingHttpHeaders(headers)).toEqual({
      'set-cookie': ['foo=bar', 'bar=foo'],
    })

    headers.append('set-cookie', 'baz=qux')

    expect(toNodeOutgoingHttpHeaders(headers)).toEqual({
      'set-cookie': ['foo=bar', 'bar=foo', 'baz=qux'],
    })
  })

  it('should handle mixed case set-cookie headers correctly', () => {
    const headers = new Headers()

    headers.append('set-cookie', 'foo=bar')
    headers.append('Set-Cookie', 'bar=foo')

    expect(toNodeOutgoingHttpHeaders(headers)).toEqual({
      'set-cookie': ['foo=bar', 'bar=foo'],
    })
  })
})
