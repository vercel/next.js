import { accumulateMetadata as originAccumulateMetadata } from './resolve-metadata'
import type { MetadataItems } from './resolve-metadata'
import type { Metadata } from './types/metadata-interface'

function accumulateMetadata(metadataItems: MetadataItems) {
  return originAccumulateMetadata(metadataItems, {
    pathname: '/test',
  })
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
      expect(metadata).toMatchObject({
        metadataBase: new URL('http://test.com/base'),
        itunes: {
          appArgument: new URL('http://test.com/base/test/native/app'),
        },
      })
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
        expect(metadata).toMatchObject(result)
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
      expect(metadata).toMatchObject({
        metadataBase: new URL('http://test.com/base'),
        openGraph: {
          url: new URL('http://test.com/base/test/abc'),
        },
      })
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
  })

  describe('themeColor', () => {
    it('should support string theme color', async () => {
      const metadataItems: MetadataItems = [
        [{ themeColor: '#000' }, null],
        [{ themeColor: '#fff' }, null],
      ]
      const metadata = await accumulateMetadata(metadataItems)
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
              userScalable: false,
              interactiveWidget: 'overlays-content',
            },
          },
          null,
        ],
      ]
      const metadata = await accumulateMetadata(metadataItems)
      expect(metadata).toMatchObject({
        viewport:
          'width=device-width, height=device-height, initial-scale=1, minimum-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no, interactive-widget=overlays-content',
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
