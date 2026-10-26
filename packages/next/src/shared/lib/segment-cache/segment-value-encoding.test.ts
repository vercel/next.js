import {
  createSegmentRequestKeyPart,
  appendSegmentRequestKeyPart,
  ROOT_SEGMENT_REQUEST_KEY,
} from './segment-value-encoding'

describe('segment-value-encoding', () => {
  it('passes ASCII names through unchanged', () => {
    expect(createSegmentRequestKeyPart('about')).toBe('about')
    expect(createSegmentRequestKeyPart(['slug', 'id', 'd'] as any)).toBe(
      '$d$slug'
    )
  })

  it('encodes non-Latin-1 static segment names without throwing', () => {
    // btoa() throws InvalidCharacterError for code points above U+00FF.
    expect(() => createSegmentRequestKeyPart('日本語')).not.toThrow()
    const part = createSegmentRequestKeyPart('日本語')
    expect(part).toMatch(/^!/)
    // Deterministic
    expect(createSegmentRequestKeyPart('日本語')).toBe(part)
    // And distinct per input
    expect(createSegmentRequestKeyPart('日本語')).not.toBe(
      createSegmentRequestKeyPart('日本語x')
    )
  })

  it('encodes non-Latin-1 dynamic param names without throwing', () => {
    expect(() =>
      createSegmentRequestKeyPart(['名前', 'user', 'd'] as any)
    ).not.toThrow()
    expect(createSegmentRequestKeyPart(['名前', 'user', 'd'] as any)).toMatch(
      /^\$d\$!/
    )
  })

  it('encodes non-Latin-1 parallel route keys without throwing', () => {
    expect(() =>
      appendSegmentRequestKeyPart(
        ROOT_SEGMENT_REQUEST_KEY,
        'サイドバー',
        createSegmentRequestKeyPart('page' as any)
      )
    ).not.toThrow()
  })

  it('encodes Latin-1 names without throwing', () => {
    expect(() => createSegmentRequestKeyPart('café')).not.toThrow()
  })
})
