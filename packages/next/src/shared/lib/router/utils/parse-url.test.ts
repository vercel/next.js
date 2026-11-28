import { parseUrl } from './parse-url'

describe('parseUrl', () => {
  it('should parse asterisk url', () => {
    const parsed = parseUrl('*')
    expect(parsed.pathname).toBe('*')
    expect(parsed.href).toBe('*')
    expect(parsed.query).toEqual({})
  })

  it('should parse relative url', () => {
    const parsed = parseUrl('/hello/world?foo=bar')
    expect(parsed.pathname).toBe('/hello/world')
    expect(parsed.query).toEqual({ foo: 'bar' })
  })

  it('should parse absolute url', () => {
    const parsed = parseUrl('http://example.com:8080/path?query=val#hash')
    expect(parsed.hostname).toBe('example.com')
    expect(parsed.port).toBe('8080')
    expect(parsed.pathname).toBe('/path')
    expect(parsed.search).toBe('?query=val')
    expect(parsed.hash).toBe('#hash')
  })
})
