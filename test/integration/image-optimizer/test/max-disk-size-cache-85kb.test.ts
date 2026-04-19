import { join } from 'path'
import { setupTests } from './util'

const appDir = join(__dirname, '../app')

describe('with maximumDiskCacheSize 85KB config', () => {
  setupTests({
    appDir,
    nextConfigImages: {
      maximumDiskCacheSize: 85_000,
    },
  })
})
