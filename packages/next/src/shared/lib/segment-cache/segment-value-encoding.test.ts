import {
  appendSegmentRequestKeyPart,
  createSegmentRequestKeyPart,
  ROOT_SEGMENT_REQUEST_KEY,
} from './segment-value-encoding'
import { PAGE_SEGMENT_KEY } from '../segment'
import type { Segment } from '../app-router-types'

function base64url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('createSegmentRequestKeyPart', () => {
  it('leaves filesystem-safe segments unencoded', () => {
    expect(createSegmentRequestKeyPart('blog')).toBe('blog')
    expect(createSegmentRequestKeyPart('post-1_v2')).toBe('post-1_v2')
  })

  it('strips search params from page segments', () => {
    expect(createSegmentRequestKeyPart(`${PAGE_SEGMENT_KEY}?a=1`)).toBe(
      PAGE_SEGMENT_KEY
    )
  })

  it('base64url-encodes segments containing unsafe characters', () => {
    expect(createSegmentRequestKeyPart('(marketing)')).toBe(
      '!' + base64url('(marketing)')
    )
  })

  // Route group and param names are directory names, so they may contain any
  // character the filesystem allows. `btoa` only accepts code points up to
  // U+00FF, so these used to throw `InvalidCharacterError`.
  describe.each([
    ['Hangul', '(안녕)'],
    ['Japanese', '日本'],
    ['Cyrillic', 'тест'],
    ['emoji', '😀'],
    ['mixed scripts', '(안녕)-café'],
  ])('non-Latin-1 segments (%s)', (_name, value) => {
    it('encodes without throwing', () => {
      expect(() => createSegmentRequestKeyPart(value)).not.toThrow()
      expect(createSegmentRequestKeyPart(value)).toBe('!' + base64url(value))
    })

    it('produces a filesystem- and URL-safe key', () => {
      const key = createSegmentRequestKeyPart(value)
      expect(key).toMatch(/^![a-zA-Z0-9\-_]*$/)
      expect(encodeURIComponent(key)).toBe(key)
    })

    it('encodes a dynamic segment with that param name', () => {
      const segment: Segment = [value, 'v', 'd', null]
      expect(() => createSegmentRequestKeyPart(segment)).not.toThrow()
      expect(createSegmentRequestKeyPart(segment)).toBe(
        '$d$!' + base64url(value)
      )
    })
  })

  it('encodes distinct non-Latin-1 segments to distinct keys', () => {
    const keys = ['안녕', '日本', 'тест', '😀'].map((value) =>
      createSegmentRequestKeyPart(value)
    )
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('appendSegmentRequestKeyPart', () => {
  it('encodes non-Latin-1 parallel route keys', () => {
    const part = createSegmentRequestKeyPart('page')
    expect(() =>
      appendSegmentRequestKeyPart(ROOT_SEGMENT_REQUEST_KEY, '모달', part)
    ).not.toThrow()
    expect(
      appendSegmentRequestKeyPart(ROOT_SEGMENT_REQUEST_KEY, '모달', part)
    ).toBe(`/@!${base64url('모달')}/page`)
  })
})
