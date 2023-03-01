import { accumulateMetadata, MetadataItems } from './resolve-metadata'
import { Metadata } from './types/metadata-interface'

describe('accumulateMetadata', () => {
  describe('typing', () => {
    it('should support both sync and async metadata', async () => {
      const metadataItems: MetadataItems = [
        [{ description: 'parent' }, null],
        [() => Promise.resolve({ description: 'child' }), null],
      ]

      const metadata = await accumulateMetadata(metadataItems)
      expect(metadata).toMatchObject({
        description: 'child',
      })
    })
  })

  describe('title', () => {
    it('should merge title with page title', async () => {
      const metadataItems: MetadataItems = [
        [{ title: 'root' }, null],
        [{ title: 'layout' }, null],
        [{ title: 'page' }, null],
      ]
      const metadata = await accumulateMetadata(metadataItems)
      expect(metadata).toMatchObject({
        title: { absolute: 'page', template: null },
      })
    })

    it('should merge title with parent layout ', async () => {
      const metadataItems: MetadataItems = [
        [{ title: 'root' }, null],
        [
          { title: { absolute: 'layout', template: '1st parent layout %s' } },
          null,
        ],
        [
          { title: { absolute: 'layout', template: '2nd parent layout %s' } },
          null,
        ],
        [null, null], // same level layout
        [{ title: 'page' }, null],
      ]
      const metadata = await accumulateMetadata(metadataItems)
      expect(metadata).toMatchObject({
        title: { absolute: '2nd parent layout page', template: null },
      })
    })
  })

  describe('openGraph', () => {
    it('should convert string or URL images field to array, not only for basic og type', async () => {
      const items: [Metadata[], Metadata][] = [
        [
          [{ openGraph: { type: 'article', images: 'https://test1.com' } }],
          { openGraph: { images: [{ url: 'https://test1.com' }] } },
        ],
        [
          [{ openGraph: { type: 'book', images: 'https://test2.com' } }],
          { openGraph: { images: [{ url: 'https://test2.com' }] } },
        ],
        [
          [
            {
              openGraph: {
                type: 'music.song',
                images: new URL('https://test3.com'),
              },
            },
          ],
          { openGraph: { images: [new URL('https://test3.com')] } },
        ],
        [
          [
            {
              openGraph: {
                type: 'music.playlist',
                images: { url: 'https://test4.com' },
              },
            },
          ],
          { openGraph: { images: [{ url: 'https://test4.com' }] } },
        ],
        [
          [
            {
              openGraph: {
                type: 'music.radio_station',
                images: 'https://test5.com',
              },
            },
          ],
          { openGraph: { images: [{ url: 'https://test5.com' }] } },
        ],
        [
          [{ openGraph: { type: 'video.movie', images: 'https://test6.com' } }],
          { openGraph: { images: [{ url: 'https://test6.com' }] } },
        ],
      ]

      items.forEach(async (item) => {
        const [configuredMetadata, result] = item
        const metadata = await accumulateMetadata(
          configuredMetadata.map((m) => [m, null])
        )
        expect(metadata).toMatchObject(result)
      })
    })
  })

  describe('themeColor', () => {
    it('should support string theme color', async () => {
      const metadataItems: MetadataItems = [
        [{ themeColor: '#000' }, null],
        [{ themeColor: '#fff' }, null],
      ]
      const metadata = await accumulateMetadata(metadataItems)
      console.log('xxmetadata', metadata.themeColor)
      expect(metadata).toMatchObject({
        themeColor: [{ color: '#fff' }],
      })
    })

    it('should support theme color descriptors', async () => {
      const metadataItems1: MetadataItems = [
        [
          {
            themeColor: {
              media: '(prefers-color-scheme: light)',
              color: '#fff',
            },
          },
          null,
        ],
        [
          {
            themeColor: {
              media: '(prefers-color-scheme: dark)',
              color: 'cyan',
            },
          },
          null,
        ],
      ]
      const metadata1 = await accumulateMetadata(metadataItems1)
      expect(metadata1).toMatchObject({
        themeColor: [{ media: '(prefers-color-scheme: dark)', color: 'cyan' }],
      })

      const metadataItems2: MetadataItems = [
        [
          {
            themeColor: [
              { media: '(prefers-color-scheme: light)', color: '#fff' },
              { media: '(prefers-color-scheme: dark)', color: 'cyan' },
            ],
          },
          null,
        ],
      ]
      const metadata2 = await accumulateMetadata(metadataItems2)
      expect(metadata2).toMatchObject({
        themeColor: [
          { media: '(prefers-color-scheme: light)', color: '#fff' },
          { media: '(prefers-color-scheme: dark)', color: 'cyan' },
        ],
      })
    })
  })

  describe('viewport', () => {
    it('should support string viewport', async () => {
      const metadataItems: MetadataItems = [
        [
          { viewport: 'width=device-width, initial-scale=1, shrink-to-fit=no' },
          null,
        ],
      ]
      const metadata = await accumulateMetadata(metadataItems)
      expect(metadata).toMatchObject({
        viewport: 'width=device-width, initial-scale=1, shrink-to-fit=no',
      })
    })

    it('should support viewport descriptors', async () => {
      const metadataItems: MetadataItems = [
        [
          {
            viewport: {
              width: 'device-width',
              height: 'device-height',
              initialScale: 1,
              minimumScale: 1,
              maximumScale: 1,
              viewportFit: 'cover',
              interactiveWidget: 'overlays-content',
            },
          },
          null,
        ],
      ]
      const metadata = await accumulateMetadata(metadataItems)
      expect(metadata).toMatchObject({
        viewport:
          'width=device-width, height=device-height, initial-scale=1, minimum-scale=1, maximum-scale=1, viewport-fit=cover, interactive-widget=overlays-content',
      })
    })
  })
})
