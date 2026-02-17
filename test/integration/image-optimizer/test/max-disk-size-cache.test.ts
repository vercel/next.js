import { join } from 'path'
import { setupTests } from './util'

const appDir = join(__dirname, '../app')

describe('with cacheMaxDiskSize 50KB config', () => {
  setupTests({
    appDir,
    cacheMaxDiskSize: 50_000,
  })
})
