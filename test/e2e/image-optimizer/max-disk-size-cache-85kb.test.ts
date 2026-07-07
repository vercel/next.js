import { setupTests } from './util'

describe('with maximumDiskCacheSize 85KB config', () => {
  setupTests({
    nextConfigImages: {
      maximumDiskCacheSize: 85_000,
    },
  })
})
