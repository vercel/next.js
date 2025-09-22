import { join } from 'path'
import { setupTests } from './util'
import { getDistDir } from 'next-test-utils'

const appDir = join(__dirname, '../app')
const imagesDir = join(appDir, getDistDir(), 'cache', 'images')

describe('with isrFlushToDisk false config', () => {
  setupTests({
    appDir,
    imagesDir,
    nextConfigExperimental: { isrFlushToDisk: false },
  })
})
