import { accumulateMetadata, MetadataItems } from './resolve-metadata'

describe('accumulateMetadata', () => {
  describe('merge title', () => {
    it('should merge page title', async () => {
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

    it('should merge page title', async () => {
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
})
