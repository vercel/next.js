import {
  fillMetadataSegment,
  fillStaticMetadataSegment,
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
      '/(post)/@feed/blog/twitter-image'
    )
    const suffix = normalizedRoute.match(/twitter-image(-[0-9a-z]{6})\/route$/)

    expect(suffix).not.toBeNull()
    expect(staticPath).toBe(`/blog/twitter-image${suffix?.[1]}.png`)
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
