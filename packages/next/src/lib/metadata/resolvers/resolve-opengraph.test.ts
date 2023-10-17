import { resolveImages } from './resolve-opengraph'

describe('resolveImages', () => {
  const image1 = 'https://www.example.com/image1.jpg'
  const image2 = 'https://www.example.com/image2.jpg'

  it(`should resolve images`, () => {
    const images = [image1, { url: image2, alt: 'Image2' }]

    expect(resolveImages(images, null)).toEqual([
      { url: new URL(image1) },
      { url: new URL(image2), alt: 'Image2' },
    ])
  })

  it('should not mutate passed images', () => {
    const images = [image1, { url: image2, alt: 'Image2' }]

    resolveImages(images, null)

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
