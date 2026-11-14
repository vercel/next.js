import { decodeNonAsciiPathname } from 'next/dist/shared/lib/router/utils/decode-non-ascii-pathname'
import { getNamedRouteRegex } from 'next/dist/shared/lib/router/utils/route-regex'
import { getRouteMatcher } from 'next/dist/shared/lib/router/utils/route-matcher'
import { createSegmentRequestKeyPart } from 'next/dist/shared/lib/segment-cache/segment-value-encoding'

describe('non-ASCII route segments', () => {
  it('decodes only non-ASCII UTF-8 sequences in static pathnames', () => {
    expect(
      decodeNonAsciiPathname('/%ED%95%9C%EA%B8%80/%252F/%2F/%25/%3F/%23')
    ).toBe('/한글/%252F/%2F/%25/%3F/%23')
    expect(decodeNonAsciiPathname('/%ed%95%9c%ea%b8%80')).toBe('/한글')
    expect(decodeNonAsciiPathname('/%FF/%E0%A4/%')).toBe('/%FF/%E0%A4/%')
    expect(decodeNonAsciiPathname('/%25ED%2595%259C')).toBe('/%25ED%2595%259C')
  })

  it.each(['한글', '日本語', 'блог', 'العربية', 'café', '😀'])(
    'matches literal and encoded %s without decoding params twice',
    (segment) => {
      const regex = getNamedRouteRegex(`/${segment}/[slug]`, {
        prefixRouteKeys: true,
      })
      const match = getRouteMatcher(regex)
      for (const pathname of [
        segment,
        encodeURIComponent(segment),
        encodeURIComponent(segment).toLowerCase(),
      ]) {
        expect(match(`/${pathname}/hello%252Fworld`)).toEqual({
          slug: 'hello%2Fworld',
        })
        expect(match(`/${pathname}/hello%2Fworld`)).toEqual({
          slug: 'hello/world',
        })
        expect(match(`/${pathname}/100%25`)).toEqual({ slug: '100%' })
        expect(new RegExp(regex.namedRegex).test(`/${pathname}/hello`)).toBe(
          true
        )
      }
    }
  )

  it('does not change ASCII case sensitivity or accept encoded path separators', () => {
    const match = getRouteMatcher(
      getNamedRouteRegex('/한글/Case/[slug]', { prefixRouteKeys: true })
    )
    expect(match('/%ED%95%9C%EA%B8%80/case/hello')).toBe(false)
    expect(match('/%ED%95%9C%EA%B8%80%2FCase/hello')).toBe(false)
    expect(() => match('/%ED%95%9C%EA%B8%80/Case/%FF')).toThrow()
  })

  it('preserves catch-all boundaries and named captures', () => {
    const regex = getNamedRouteRegex('/한글/[...slug]', {
      prefixRouteKeys: true,
    })
    const pathname = '/%ED%95%9C%EA%B8%80/one%2Ftwo/three%252Ffour'
    expect(getRouteMatcher(regex)(pathname)).toEqual({
      slug: ['one/two', 'three%2Ffour'],
    })
    expect(new RegExp(regex.namedRegex).exec(pathname)?.groups).toEqual({
      nxtPslug: 'one%2Ftwo/three%252Ffour',
    })
  })

  it('matches Unicode prefixes and suffixes without changing the capture', () => {
    const regex = getNamedRouteRegex('/前[slug]後', {
      prefixRouteKeys: true,
      includePrefix: true,
      includeSuffix: true,
    })
    expect(getRouteMatcher(regex)('/%E5%89%8Dhello%25%E5%BE%8C')).toEqual({
      slug: 'hello%',
    })
    expect(
      new RegExp(regex.namedRegex).test('/%E5%89%8Dhello%25%E5%BE%8C')
    ).toBe(true)
  })

  it.each(['교사-월급-계산기', '日本語', 'café', '😀'])(
    'encodes %s as UTF-8 in segment cache keys',
    (segment) => {
      expect(createSegmentRequestKeyPart(segment)).toBe(
        '!' + Buffer.from(segment).toString('base64url')
      )
    }
  )

  it('preserves simple ASCII cache keys', () => {
    expect(createSegmentRequestKeyPart('hello-world')).toBe('hello-world')
  })
})
