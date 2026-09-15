import {
  createSegmentRequestKeyPart,
  encodeToFilesystemAndURLSafeString,
} from './segment-value-encoding'

describe('encodeToFilesystemAndURLSafeString', () => {
  it('returns simple values as-is', () => {
    expect(encodeToFilesystemAndURLSafeString('about')).toBe('about')
    expect(encodeToFilesystemAndURLSafeString('a-b_c@d')).toBe('a-b_c@d')
  })

  it('base64url-encodes values with unsafe ASCII characters', () => {
    expect(encodeToFilesystemAndURLSafeString('(group)')).toBe('!KGdyb3VwKQ')
    expect(encodeToFilesystemAndURLSafeString('a b')).toBe('!YSBi')
  })

  // `btoa` throws an InvalidCharacterError for any character outside the
  // Latin-1 range, which crashed rendering for route groups and segments with
  // non-ASCII names. The value must be UTF-8 encoded before base64url-encoding.
  it.each([
    ['Korean', '(안녕)', '!KOyViOuFlSk'],
    ['Japanese', '日本', '!5pel5pys'],
    ['Cyrillic', 'тест', '!0YLQtdGB0YI'],
    ['Latin-1 supplement', 'café', '!Y2Fmw6k'],
    ['emoji', '😀', '!8J-YgA'],
  ])('encodes non-Latin-1 input as UTF-8 (%s)', (_name, input, expected) => {
    expect(encodeToFilesystemAndURLSafeString(input)).toBe(expected)
  })

  it('produces filesystem and URL safe output', () => {
    const encoded = encodeToFilesystemAndURLSafeString('(안녕)/😀+x')
    expect(encoded).toMatch(/^![A-Za-z0-9\-_]+$/)
  })

  it('produces distinct keys for distinct non-ASCII inputs', () => {
    expect(encodeToFilesystemAndURLSafeString('안녕')).not.toBe(
      encodeToFilesystemAndURLSafeString('안녕하세요')
    )
  })
})

describe('createSegmentRequestKeyPart', () => {
  it('handles non-Latin-1 static segments', () => {
    expect(createSegmentRequestKeyPart('(안녕)')).toBe('!KOyViOuFlSk')
  })

  it('handles non-Latin-1 dynamic segment names', () => {
    expect(createSegmentRequestKeyPart(['슬러그', 'value', 'd'])).toBe(
      '$d$!7Iqs65-s6re4'
    )
  })
})
