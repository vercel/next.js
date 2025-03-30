import { resolveImages, resolveOpenGraph } from './resolve-opengraph'

describe('resolveImages', () => {
  const image1 = 'https://www.example.com/image1.jpg'
  const image2 = 'https://www.example.com/image2.jpg'

  it(`should resolve images`, () => {
    const images = [image1, { url: image2, alt: 'Image2' }]

    expect(resolveImages(images, null, false)).toEqual([
      { url: new URL(image1) },
      { url: new URL(image2), alt: 'Image2' },
    ])
  })

  it('should not mutate passed images', () => {
    const images = [image1, { url: image2, alt: 'Image2' }]

    resolveImages(images, null, false)

    expect(images).toEqual([image1, { url: image2, alt: 'Image2' }])
  })

  it('should filter out invalid images', () => {
    const images = [
      image1,
      { url: image2, alt: 'Image2' },
      { alt: 'Image3' },
      undefined,
    ]

    // @ts-expect-error - intentionally passing invalid images
    expect(resolveImages(images, null)).toEqual([
      { url: new URL(image1) },
      { url: new URL(image2), alt: 'Image2' },
    ])
  })
})

describe('resolveOpenGraph', () => {
  it('should return null if the value is an empty string', () => {
    expect(
      resolveOpenGraph(
        // pass authors as empty string
        { type: 'article', authors: '' },
        null,
        {
          trailingSlash: false,
          pathname: '',
          isStaticMetadataRouteFile: false,
        },
        ''
      )
    ).toEqual({
      // if an empty string '' is passed, it'll throw: "n.map is not a function"
      // x-ref: https://github.com/vercel/next.js/pull/68262
      authors: null,
      images: undefined,
      title: { absolute: '', template: null },
      type: 'article',
      url: null,
    })
  })

  it('should return null if the value is null', () => {
    expect(
      resolveOpenGraph(
        { type: 'article', authors: null },
        null,
        {
          trailingSlash: false,
          pathname: '',
          isStaticMetadataRouteFile: false,
        },
        ''
      )
    ).toEqual({
      authors: null,
      images: undefined,
      title: { absolute: '', template: null },
      type: 'article',
      url: null,
    })
  })
})
