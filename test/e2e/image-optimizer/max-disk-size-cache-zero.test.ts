import { setupTests } from './util'

describe('with maximumDiskCacheSize zero config', () => {
  setupTests({
    nextConfigImages: {
      maximumDiskCacheSize: 0,
    },
  })
})
