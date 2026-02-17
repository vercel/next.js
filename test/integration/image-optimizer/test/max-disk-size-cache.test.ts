import { join } from 'path'
import { setupTests } from './util'

const appDir = join(__dirname, '../app')

describe('with cacheMaxDiskSize 85KB config', () => {
  setupTests({
    appDir,
    cacheMaxDiskSize: 85_000,
  })
})
