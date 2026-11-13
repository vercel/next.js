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
  it.each(['music.album', 'music.playlist'] as const)(
    'should normalize scalar and array songs for %s',
    async (type) => {
      const url = 'https://example.com/song'
      const descriptor = { url, disc: 1, track: 2 }
      for (const songs of [url, new URL(url), descriptor, [url, descriptor]]) {
        const resolved = await resolveOpenGraph(
          { type, songs },
          null,
          Promise.resolve('/'),
          { trailingSlash: false, isStaticMetadataRouteFile: false },
          null
        )

        expect(resolved).toMatchObject({
          type,
          songs: Array.isArray(songs) ? songs : [songs],
        })
      }
    }
  )

  it('should normalize scalar and array playlist creators', async () => {
    const url = 'https://example.com/creator'
    for (const creators of [url, new URL(url), [url]]) {
      const resolved = await resolveOpenGraph(
        { type: 'music.playlist', creators },
        null,
        Promise.resolve('/'),
        { trailingSlash: false, isStaticMetadataRouteFile: false },
        null
      )

      expect(resolved).toMatchObject({
        type: 'music.playlist',
        creators: Array.isArray(creators) ? creators : [creators],
      })
    }
  })

  it('should return null if the value is an empty string', async () => {
    const pathname = Promise.resolve('')
    expect(
      await resolveOpenGraph(
        // pass authors as empty string
        { type: 'article', authors: '' },
        null,
        pathname,
        {
          trailingSlash: false,
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

  it('should return null if the value is null', async () => {
    const pathname = Promise.resolve('')
    expect(
      await resolveOpenGraph(
        { type: 'article', authors: null },
        null,
        pathname,
        {
          trailingSlash: false,
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
