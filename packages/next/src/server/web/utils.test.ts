import { toNodeOutgoingHttpHeaders, encodeHeaderValue, decodeHeaderValue } from './utils'

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

describe('encodeHeaderValue', () => {
  it('should return ASCII values unchanged', () => {
    expect(encodeHeaderValue('hello-world')).toBe('hello-world')
    expect(encodeHeaderValue('test_value')).toBe('test_value')
    expect(encodeHeaderValue('123')).toBe('123')
  })

  it('should encode non-ASCII characters', () => {
    expect(encodeHeaderValue('Montréal')).toBe('Montr%C3%A9al')
    expect(encodeHeaderValue('café')).toBe('caf%C3%A9')
    expect(encodeHeaderValue('北京')).toBe('%E5%8C%97%E4%BA%AC')
    expect(encodeHeaderValue('русский')).toBe('%D1%80%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9')
  })

  it('should preserve spaces', () => {
    expect(encodeHeaderValue('hello world')).toBe('hello world')
    expect(encodeHeaderValue('Montréal city')).toBe('Montr%C3%A9al city')
  })

  it('should handle mixed ASCII and non-ASCII', () => {
    expect(encodeHeaderValue('City: Montréal')).toBe('City: Montr%C3%A9al')
  })
})

describe('decodeHeaderValue', () => {
  it('should return unencoded values unchanged', () => {
    expect(decodeHeaderValue('hello-world')).toBe('hello-world')
    expect(decodeHeaderValue('test_value')).toBe('test_value')
    expect(decodeHeaderValue('123')).toBe('123')
  })

  it('should decode percent-encoded values', () => {
    expect(decodeHeaderValue('Montr%C3%A9al')).toBe('Montréal')
    expect(decodeHeaderValue('caf%C3%A9')).toBe('café')
    expect(decodeHeaderValue('%E5%8C%97%E4%BA%AC')).toBe('北京')
    expect(decodeHeaderValue('%D1%80%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9')).toBe('русский')
  })

  it('should handle spaces correctly', () => {
    expect(decodeHeaderValue('hello world')).toBe('hello world')
    expect(decodeHeaderValue('Montr%C3%A9al city')).toBe('Montréal city')
  })

  it('should handle mixed encoded and unencoded values', () => {
    expect(decodeHeaderValue('City: Montr%C3%A9al')).toBe('City: Montréal')
  })

  it('should return original value if decoding fails', () => {
    expect(decodeHeaderValue('invalid%')).toBe('invalid%')
    expect(decodeHeaderValue('invalid%2')).toBe('invalid%2')
    expect(decodeHeaderValue('%XX')).toBe('%XX')
  })

  it('should round-trip encode/decode correctly', () => {
    const testValues = [
      'Montréal',
      'café',
      '北京',
      'русский',
      'hello world',
      'mixed: Montréal café 北京',
    ]

    for (const value of testValues) {
      expect(decodeHeaderValue(encodeHeaderValue(value))).toBe(value)
    }
  })
})
