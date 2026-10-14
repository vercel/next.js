import type { Page, Route } from '../../shared/lib/route-types'
import {
  fillMetadataSegment,
  fillStaticMetadataSegment,
  getStaticMetadataPrerenderPathname,
  normalizeMetadataRoute,
} from './get-metadata-route'

describe('fillStaticMetadataSegment', () => {
  it('should preserve a statically known root favicon path', () => {
    expect(fillStaticMetadataSegment('/', 'favicon.ico')).toBe('/favicon.ico')
  })

  it('should replace dynamic segments with placeholder segments', () => {
    expect(fillStaticMetadataSegment('/blog/[slug]', 'favicon.ico')).toBe(
      '/blog/-/favicon.ico'
    )
    expect(fillStaticMetadataSegment('/blog/[...slug]', 'icon.png')).toBe(
      '/blog/-/icon.png'
    )
  })

  it('should preserve grouped metadata suffixes', () => {
    const staticPath = fillStaticMetadataSegment(
      '/(post)/@feed/blog',
      'twitter-image.png'
    )
    const normalizedRoute = normalizeMetadataRoute(
      '/(post)/@feed/blog/twitter-image' as Page
    )
    const suffix = normalizedRoute.match(/twitter-image(-[0-9a-z]{6})\/route$/)

    expect(suffix).not.toBeNull()
    expect(staticPath).toBe(`/blog/twitter-image${suffix?.[1]}.png`)
  })
})

describe('getStaticMetadataPrerenderPathname', () => {
  it('should return null for non-metadata routes', () => {
    expect(
      getStaticMetadataPrerenderPathname('/dynamic/[id]/page' as Route)
    ).toBeNull()
  })

  it('should normalize static metadata under dynamic segments', () => {
    expect(
      getStaticMetadataPrerenderPathname(
        '/dynamic/[id]/apple-icon.png' as Route
      )
    ).toBe('/dynamic/-/apple-icon.png')
    expect(
      getStaticMetadataPrerenderPathname('/dynamic/[id]/sitemap.xml' as Route)
    ).toBe('/dynamic/-/sitemap.xml')
  })

  it('should preserve static metadata routes without dynamic segments', () => {
    expect(
      getStaticMetadataPrerenderPathname('/static/apple-icon.png' as Route)
    ).toBe('/static/apple-icon.png')
  })

  it('should collapse catchall segments to a single placeholder', () => {
    expect(
      getStaticMetadataPrerenderPathname('/[...slug]/apple-icon.png' as Route)
    ).toBe('/-/apple-icon.png')
  })

  it('should collapse optional catchall segments to a single placeholder', () => {
    expect(
      getStaticMetadataPrerenderPathname('/[[...slug]]/apple-icon.png' as Route)
    ).toBe('/-/apple-icon.png')
  })

  it('should replace each dynamic segment independently', () => {
    expect(
      getStaticMetadataPrerenderPathname('/[a]/[b]/apple-icon.png' as Route)
    ).toBe('/-/-/apple-icon.png')
  })

  it('should preserve literal segments between dynamic ones', () => {
    expect(
      getStaticMetadataPrerenderPathname(
        '/[lang]/posts/[slug]/apple-icon.png' as Route
      )
    ).toBe('/-/posts/-/apple-icon.png')
  })

  it('should normalize mixed dynamic and catchall segments', () => {
    expect(
      getStaticMetadataPrerenderPathname(
        '/[lang]/[...rest]/apple-icon.png' as Route
      )
    ).toBe('/-/-/apple-icon.png')
  })
})

describe('fillMetadataSegment', () => {
  it('should continue to interpolate dynamic metadata routes from params', () => {
    expect(
      fillMetadataSegment(
        '/blog/[slug]',
        { slug: 'post-1' },
        'opengraph-image',
        false
      )
    ).toBe('/blog/post-1/opengraph-image')

    expect(
      fillMetadataSegment(
        '/blog/[...slug]',
        { slug: ['post-1', 'nested'] },
        'opengraph-image',
        false
      )
    ).toBe('/blog/post-1/nested/opengraph-image')
  })
})
