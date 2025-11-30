import { join } from 'path'
import { setupTests } from './util'

const appDir = join(__dirname, '../app')

describe('with contentDispositionType inline', () => {
  setupTests({
    nextConfigImages: { contentDispositionType: 'inline' },
    appDir,
  })
})
