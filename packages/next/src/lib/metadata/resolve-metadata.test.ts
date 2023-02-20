import { accumulateMetadata, MetadataItems } from './resolve-metadata'

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

    it.each`
      metadataItems                                                                         | result
      ${[[{ openGraph: { type: 'article', images: 'https://test.com' } }, null]]}           | ${{ openGraph: { images: ['https://test.com'] } }}
      ${[[{ openGraph: { type: 'book', images: 'https://test.com' } }, null]]}              | ${{ openGraph: { images: ['https://test.com'] } }}
      ${[[{ openGraph: { type: 'song', images: new URL('https://test.com') } }, null]]}     | ${{ openGraph: { images: [new URL('https://test.com')] } }}
      ${[[{ openGraph: { type: 'playlist', images: { url: 'https://test.com' } } }, null]]} | ${{ openGraph: { images: [{ url: 'https://test.com' }] } }}
      ${[[{ openGraph: { type: 'radio', images: 'https://test.com' } }, null]]}             | ${{ openGraph: { images: ['https://test.com'] } }}
      ${[[{ openGraph: { type: 'video', images: 'https://test.com' } }, null]]}             | ${{ openGraph: { images: ['https://test.com'] } }}
    `(
      'should convert string or URL images field to array, not only for basic og type',
      async ({ metadataItems, result }) => {
        const metadata = await accumulateMetadata(metadataItems)
        expect(metadata).toMatchObject(result)
      }
    )
  })
})
