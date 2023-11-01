import {
  accumulateViewport as originAccumulateViewport,
  accumulateMetadata as originAccumulateMetadata,
} from './resolve-metadata'
import type { MetadataItems as FullMetadataItems } from './resolve-metadata'
import type { Metadata, Viewport } from './types/metadata-interface'

type FullMetadataItem = FullMetadataItems[number]
type MetadataItems = [FullMetadataItem[0], FullMetadataItem[1]][]

function accumulateMetadata(metadataItems: MetadataItems) {
  const fullMetadataItems: FullMetadataItems = metadataItems.map((item) => [
    item[0],
    item[1],
    null,
  ])
  return originAccumulateMetadata(fullMetadataItems, {
    pathname: '/test',
  })
}

function accumulateViewport(viewportExports: Viewport[]) {
  // skip the first two arguments (metadata and static metadata)
  return originAccumulateViewport(
    viewportExports.map((item) => [null, null, item])
  )
}

function mapUrlsToStrings(obj: any) {
  if (typeof obj === 'object') {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (obj[key] instanceof URL) {
          // If the property is a URL instance, convert it to a string
          obj[key] = obj[key].href
        } else if (typeof obj[key] === 'object') {
          // Recursively process nested objects
          obj[key] = mapUrlsToStrings(obj[key])
        }
      }
    }
  }
  return obj
}

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

  describe('icon', () => {
    it('should resolve icons.icon correctly', async () => {
      // array icons
      expect(
        await accumulateMetadata([
          [
            {
              icons: [
                {
                  url: 'favicon-light.png',
                  rel: 'icon',
                  media: '(prefers-color-scheme: light)',
                },
                {
                  url: 'favicon-dark.png',
                  rel: 'icon',
                  media: '(prefers-color-scheme: dark)',
                },
              ],
            },
            null,
          ],
        ])
      ).toMatchObject({
        icons: {
          icon: [
            {
              url: 'favicon-light.png',
              rel: 'icon',
              media: '(prefers-color-scheme: light)',
            },
            {
              url: 'favicon-dark.png',
              rel: 'icon',
              media: '(prefers-color-scheme: dark)',
            },
          ],
        },
      })

      // string icons
      expect(
        await accumulateMetadata([
          [
            {
              icons: 'favicon-light.png',
            },
            null,
          ],
        ])
      ).toMatchObject({
        icons: {
          icon: [
            {
              url: 'favicon-light.png',
            },
          ],
        },
      })

      // icon.icons array
      expect(
        await accumulateMetadata([
          [
            {
              icons: {
                icon: [
                  {
                    url: 'favicon-light.png',
                  },
                  {
                    url: 'favicon-dark.png',
                  },
                ],
              },
            },
            null,
          ],
        ])
      ).toMatchObject({
        icons: {
          icon: [
            {
              url: 'favicon-light.png',
            },
            {
              url: 'favicon-dark.png',
            },
          ],
        },
      })
    })

    it('should resolve icons.apple', async () => {
      expect(
        await accumulateMetadata([
          [
            {
              icons: {
                apple: [
                  {
                    url: 'apple-touch-icon-light.png',
                    media: '(prefers-color-scheme: light)',
                  },
                ],
              },
            },
            null,
          ],
        ])
      ).toMatchObject({
        icons: {
          apple: [
            {
              url: 'apple-touch-icon-light.png',
              media: '(prefers-color-scheme: light)',
            },
          ],
        },
      })
    })
  })

  describe('itunes', () => {
    it('should resolve relative url starting with ./ with pathname for itunes.appArgument', async () => {
      const metadataItems: MetadataItems = [
        [
          {
            metadataBase: new URL('http://test.com/base'),
            itunes: { appId: 'id', appArgument: './native/app' },
          },
          null,
        ],
      ]
      const metadata = await accumulateMetadata(metadataItems)
      expect(mapUrlsToStrings(metadata)).toMatchObject(
        mapUrlsToStrings({
          metadataBase: new URL('http://test.com/base'),
          itunes: {
            appArgument: new URL('http://test.com/base/test/native/app'),
          },
        })
      )
    })
  })

  describe('openGraph and twitter', () => {
    it('should convert string or URL images field to array, not only for basic og type', async () => {
      const items: [Metadata[], Metadata][] = [
        [
          [{ openGraph: { type: 'article', images: 'https://test1.com' } }],
          { openGraph: { images: [{ url: new URL('https://test1.com') }] } },
        ],
        [
          [{ openGraph: { type: 'book', images: 'https://test2.com' } }],
          { openGraph: { images: [{ url: new URL('https://test2.com/') }] } },
        ],
        [
          [
            {
              openGraph: {
                type: 'music.song',
                images: new URL('https://test-og-3.com'),
              },
            },
          ],
          {
            openGraph: { images: [{ url: new URL('https://test-og-3.com') }] },
          },
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
          { openGraph: { images: [{ url: new URL('https://test4.com') }] } },
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
          { openGraph: { images: [{ url: new URL('https://test5.com') }] } },
        ],
        [
          [{ openGraph: { type: 'video.movie', images: 'https://test6.com' } }],
          { openGraph: { images: [{ url: new URL('https://test6.com') }] } },
        ],
      ]

      items.forEach(async (item) => {
        const [configuredMetadata, result] = item
        const metadata = await accumulateMetadata(
          configuredMetadata.map((m) => [m, null])
        )
        expect(mapUrlsToStrings(metadata)).toMatchObject(
          mapUrlsToStrings(result)
        )
      })
    })

    it('should fill twitter with partial existing openGraph metadata', async () => {
      const metadataItems: MetadataItems = [
        [
          {
            openGraph: {
              title: 'title',
              description: 'description',
              images: 'https://test.com',
            },
            twitter: {
              card: 'summary_large_image',
            },
          },
          null,
        ],
      ]
      const metadata = await accumulateMetadata(metadataItems)
      expect(metadata).toMatchObject({
        openGraph: {
          title: {
            absolute: 'title',
            template: null,
          },
          description: 'description',
          images: [{ url: new URL('https://test.com') }],
        },
        twitter: {
          card: 'summary_large_image',
          title: {
            absolute: 'title',
            template: null,
          },
          description: 'description',
          images: [{ url: new URL('https://test.com') }],
        },
      })
    })

    it('should fill only the existing props from openGraph to twitter', async () => {
      const metadataItems: MetadataItems = [
        [
          {
            openGraph: {
              // skip title
              description: 'description',
            },
          },
          // has static metadata files
          {
            icon: undefined,
            apple: undefined,
            twitter: ['/og/twitter.png'],
            openGraph: undefined,
            manifest: undefined,
          },
        ],
      ]
      const metadata = await accumulateMetadata(metadataItems)
      expect(metadata).toMatchObject({
        openGraph: {
          title: {
            absolute: '',
            template: null,
          },
          description: 'description',
        },
        twitter: {
          title: {
            absolute: '',
            template: null,
          },
          description: 'description',
        },
      })
    })

    it('should resolve relative url starting with ./ with pathname for openGraph.url', async () => {
      const metadataItems: MetadataItems = [
        [
          {
            metadataBase: new URL('http://test.com/base'),
            openGraph: {
              url: './abc',
            },
          },
          null,
        ],
      ]
      const metadata = await accumulateMetadata(metadataItems)
      expect(mapUrlsToStrings(metadata)).toMatchObject(
        mapUrlsToStrings({
          metadataBase: new URL('http://test.com/base'),
          openGraph: {
            url: new URL('http://test.com/base/test/abc'),
          },
        })
      )
    })

    it('should override openGraph or twitter images when current layer specifies social images properties', async () => {
      const metadataItems1: MetadataItems = [
        [
          {
            openGraph: {
              images: 'https://test.com/og.png',
            },
            twitter: {
              images: 'https://test.com/twitter.png',
            },
          },
          // has static metadata files
          {
            icon: undefined,
            apple: undefined,
            twitter: ['/filebased/twitter.png'],
            openGraph: ['/filebased/og.png'],
            manifest: undefined,
          },
        ],
      ]
      const metadata1 = await accumulateMetadata(metadataItems1)
      expect(metadata1).toMatchObject({
        openGraph: {
          images: [{ url: new URL('https://test.com/og.png') }],
        },
        twitter: {
          images: [{ url: new URL('https://test.com/twitter.png ') }],
        },
      })

      const metadataItems2: MetadataItems = [
        [
          function gM2() {
            return {
              openGraph: {
                images: undefined,
              },
              // twitter is not specified, supposed to merged with openGraph but images should not be picked up
            }
          },
          // has static metadata files
          {
            icon: undefined,
            apple: undefined,
            twitter: undefined,
            openGraph: ['/filebased/og.png'],
            manifest: undefined,
          },
        ],
      ]
      const metadata2 = await accumulateMetadata(metadataItems2)
      expect(metadata2).toMatchObject({
        openGraph: {
          images: undefined,
        },
        twitter: {
          images: undefined,
        },
      })
    })

    it('should inherit metadata title description into openGraph or twitter if they are configured', async () => {
      const metadataItems1: MetadataItems = [
        [
          {
            title: 'My title',
            description: 'My description',
            openGraph: {
              images: 'https://test.com/og.png',
            },
          },
          null,
        ],
      ]
      const metadata1 = await accumulateMetadata(metadataItems1)
      expect(metadata1).toMatchObject({
        openGraph: {
          title: {
            absolute: 'My title',
            template: null,
          },
          description: 'My description',
        },
        twitter: {
          title: {
            absolute: 'My title',
            template: null,
          },
          description: 'My description',
        },
      })

      const metadataItems2: MetadataItems = [
        [
          {
            title: 'My title',
            description: 'My description',
            twitter: {
              images: 'https://test.com/twitter.png',
            },
          },
          null,
        ],
      ]
      const metadata2 = await accumulateMetadata(metadataItems2)
      expect(metadata2).toMatchObject({
        openGraph: null,
        twitter: {
          title: {
            absolute: 'My title',
            template: null,
          },
          description: 'My description',
        },
      })

      // Don't override if there's already a title in twitter
      const metadataItems3: MetadataItems = [
        [
          {
            title: 'My title',
            description: 'My description',
            twitter: {
              title: 'My twitter title',
              images: 'https://test.com/twitter.png',
            },
          },
          null,
        ],
      ]
      const metadata3 = await accumulateMetadata(metadataItems3)
      expect(metadata3).toMatchObject({
        openGraph: null,
        title: {
          absolute: 'My title',
          template: null,
        },
        twitter: {
          title: {
            absolute: 'My twitter title',
            template: null,
          },
          description: 'My description',
        },
      })
    })
  })

  describe('alternate', () => {
    it('should support string alternate', async () => {
      const metadataItems: MetadataItems = [
        [
          {
            alternates: {
              canonical: '/relative',
              languages: {
                'en-US': 'https://example.com/en-US',
                'de-DE': 'https://example.com/de-DE',
              },
              media: {
                'only screen and (max-width: 600px)': '/mobile',
              },
              types: {
                'application/rss+xml': 'https://example.com/rss',
              },
            },
          },
          null,
        ],
      ]
      const metadata = await accumulateMetadata(metadataItems)
      expect(metadata).toMatchObject({
        alternates: {
          canonical: { url: '/relative' },
          languages: {
            'en-US': [{ url: 'https://example.com/en-US' }],
            'de-DE': [{ url: 'https://example.com/de-DE' }],
          },
          media: {
            'only screen and (max-width: 600px)': [{ url: '/mobile' }],
          },
          types: {
            'application/rss+xml': [{ url: 'https://example.com/rss' }],
          },
        },
      })
    })

    it('should support alternate descriptors', async () => {
      const metadataItems: MetadataItems = [
        [
          {
            alternates: {
              canonical: '/relative',
              languages: {
                'en-US': [
                  { url: '/en-US', title: 'en' },
                  { url: '/zh_CN', title: 'zh' },
                ],
              },
              media: {
                'only screen and (max-width: 600px)': [
                  { url: '/mobile', title: 'mobile' },
                ],
              },
              types: {
                'application/rss+xml': 'https://example.com/rss',
              },
            },
          },
          null,
        ],
      ]
      const metadata = await accumulateMetadata(metadataItems)
      expect(metadata).toMatchObject({
        alternates: {
          canonical: { url: '/relative' },
          languages: {
            'en-US': [
              { url: '/en-US', title: 'en' },
              { url: '/zh_CN', title: 'zh' },
            ],
          },
          media: {
            'only screen and (max-width: 600px)': [
              { url: '/mobile', title: 'mobile' },
            ],
          },
          types: {
            'application/rss+xml': [{ url: 'https://example.com/rss' }],
          },
        },
      })
    })
  })
})

describe('accumulateViewport', () => {
  describe('viewport', () => {
    it('should support viewport descriptors', async () => {
      const viewport = await accumulateViewport([
        {
          width: 'device-width',
          height: 'device-height',
          initialScale: 1,
          minimumScale: 1,
          maximumScale: 1,
          viewportFit: 'cover',
          userScalable: false,
          interactiveWidget: 'overlays-content',
        },
      ])
      expect(viewport).toMatchObject({
        width: 'device-width',
        height: 'device-height',
        initialScale: 1,
        minimumScale: 1,
        maximumScale: 1,
        viewportFit: 'cover',
        userScalable: false,
        interactiveWidget: 'overlays-content',
      })
    })
  })

  describe('themeColor', () => {
    it('should support string theme color', async () => {
      const metadataItems: Viewport[] = [
        { themeColor: '#000' },
        { themeColor: '#fff' },
      ]
      const viewport = await accumulateViewport(metadataItems)
      expect(viewport).toMatchObject({
        themeColor: [{ color: '#fff' }],
      })
    })

    it('should support theme color descriptors', async () => {
      const viewportInput1: Viewport[] = [
        {
          themeColor: {
            media: '(prefers-color-scheme: light)',
            color: '#fff',
          },
        },
        {
          themeColor: {
            media: '(prefers-color-scheme: dark)',
            color: 'cyan',
          },
        },
      ]

      const viewport1 = await accumulateViewport(viewportInput1)
      expect(viewport1).toMatchObject({
        themeColor: [{ media: '(prefers-color-scheme: dark)', color: 'cyan' }],
      })

      const viewportInput2: Viewport[] = [
        {
          themeColor: [
            { media: '(prefers-color-scheme: light)', color: '#fff' },
            { media: '(prefers-color-scheme: dark)', color: 'cyan' },
          ],
        },
      ]
      const viewport2 = await accumulateViewport(viewportInput2)
      expect(viewport2).toMatchObject({
        themeColor: [
          { media: '(prefers-color-scheme: light)', color: '#fff' },
          { media: '(prefers-color-scheme: dark)', color: 'cyan' },
        ],
      })
    })
  })
})
